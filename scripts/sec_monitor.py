#!/usr/bin/env python3
"""SEC EDGAR filing monitor - fetches filings, matches watchlists, summarizes with AI, sends digests."""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

import boto3
import requests
from botocore.exceptions import ClientError

# --- Configuration ---
EDGAR_RSS_BASE = "https://efts.sec.gov/LATEST/search-index"
EDGAR_FULL_TEXT_SEARCH = "https://efts.sec.gov/LATEST/search-index"
EDGAR_FILING_API = "https://efts.sec.gov/LATEST/search-index"
EDGAR_COMPANY_FILINGS = "https://data.sec.gov/submissions/CIK{cik}.json"
EDGAR_FILING_INDEX = "https://www.sec.gov/cgi-bin/browse-edgar"

# EDGAR requires a User-Agent header with contact info
EDGAR_USER_AGENT = os.environ.get(
    "EDGAR_USER_AGENT",
    "ZipperDataBrief/1.0 (your-email@example.com)"
)
EDGAR_HEADERS = {
    "User-Agent": EDGAR_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
}

# EDGAR rate limit: max 10 requests/second
EDGAR_REQUEST_DELAY = 0.15  # seconds between requests

FILINGS_TABLE = os.environ.get("FILINGS_TABLE", "sec-filing-cache")
USERS_TABLE = os.environ.get("USERS_TABLE", "sec-filing-users")
WATCHLISTS_TABLE = os.environ.get("WATCHLISTS_TABLE", "sec-filing-watchlists")
SENDER_EMAIL = os.environ.get("SEC_SENDER_EMAIL", "filings@zipperdatabrief.com")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
REQUEST_TIMEOUT = 15

# Filing types we track
SUPPORTED_FORM_TYPES = {"8-K", "10-K", "10-Q", "13F-HR", "SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A", "DEF 14A"}

# Bedrock for summarization
BEDROCK_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# --- AWS Clients ---

def get_dynamodb():
    return boto3.resource("dynamodb", region_name=AWS_REGION)


def get_ses_client():
    return boto3.client("ses", region_name=AWS_REGION)


def get_bedrock_client():
    return boto3.client("bedrock-runtime", region_name=AWS_REGION)


# --- EDGAR Data Fetching ---

def pad_cik(cik: str) -> str:
    """Pad CIK to 10 digits as EDGAR expects."""
    return cik.zfill(10)


def fetch_company_filings(cik: str, form_types: set | None = None) -> list[dict]:
    """Fetch recent filings for a company from EDGAR.

    Returns list of filing dicts with keys:
        accession_number, form_type, filed_at, primary_document, description, cik, company_name
    """
    padded = pad_cik(cik)
    url = EDGAR_COMPANY_FILINGS.format(cik=padded)

    log.info("Fetching filings for CIK %s from %s", cik, url)
    resp = requests.get(url, headers=EDGAR_HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    company_name = data.get("name", "Unknown")
    recent = data.get("filings", {}).get("recent", {})

    filings = []
    accession_numbers = recent.get("accessionNumber", [])
    form_type_list = recent.get("form", [])
    filing_dates = recent.get("filingDate", [])
    primary_docs = recent.get("primaryDocument", [])
    descriptions = recent.get("primaryDocDescription", [])

    for i in range(len(accession_numbers)):
        form = form_type_list[i] if i < len(form_type_list) else ""
        if form_types and form not in form_types:
            continue

        filings.append({
            "accession_number": accession_numbers[i],
            "form_type": form,
            "filed_at": filing_dates[i] if i < len(filing_dates) else "",
            "primary_document": primary_docs[i] if i < len(primary_docs) else "",
            "description": descriptions[i] if i < len(descriptions) else "",
            "cik": cik,
            "company_name": company_name,
        })

    log.info("Found %d matching filings for %s (%s)", len(filings), company_name, cik)
    return filings


def fetch_filing_text(cik: str, accession_number: str, primary_document: str) -> str:
    """Fetch the full text of a filing document. Returns first ~50K chars.

    For 8-Ks that are just wrappers around exhibits, follows the exhibit link
    to get the actual content (e.g. press releases in Exhibit 99.1).
    """
    acc_no_dashes = accession_number.replace("-", "")
    padded = pad_cik(cik)
    base_url = f"https://www.sec.gov/Archives/edgar/data/{padded}/{acc_no_dashes}"
    url = f"{base_url}/{primary_document}"

    log.info("Fetching filing text from %s", url)
    resp = requests.get(url, headers=EDGAR_HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()

    raw_html = resp.text
    text = re.sub(r"<[^>]+>", " ", raw_html)
    text = re.sub(r"\s+", " ", text).strip()

    # If the 8-K text is thin (just a wrapper), try to fetch the exhibit
    if len(text) < 2000:
        exhibit_match = re.search(
            r'href=["\']([^"\']*(?:ex|exhibit)[^"\']*\.htm[l]?)["\']',
            raw_html, re.IGNORECASE,
        )
        if exhibit_match:
            exhibit_path = exhibit_match.group(1)
            # Handle relative vs absolute paths
            if exhibit_path.startswith("http"):
                exhibit_url = exhibit_path
            else:
                exhibit_url = f"{base_url}/{exhibit_path}"
            log.info("Primary doc is thin, fetching exhibit from %s", exhibit_url)
            time.sleep(EDGAR_REQUEST_DELAY)
            try:
                exhibit_resp = requests.get(exhibit_url, headers=EDGAR_HEADERS, timeout=REQUEST_TIMEOUT)
                exhibit_resp.raise_for_status()
                exhibit_text = re.sub(r"<[^>]+>", " ", exhibit_resp.text)
                exhibit_text = re.sub(r"\s+", " ", exhibit_text).strip()
                if len(exhibit_text) > len(text):
                    text = exhibit_text
            except Exception as e:
                log.warning("Failed to fetch exhibit: %s", e)

    return text[:50000]


def ticker_to_cik(ticker: str) -> str | None:
    """Look up a CIK number from a ticker symbol using EDGAR's company search."""
    url = "https://www.sec.gov/cgi-bin/browse-edgar"
    params = {
        "company": "",
        "CIK": ticker,
        "type": "",
        "dateb": "",
        "owner": "include",
        "count": "1",
        "search_text": "",
        "action": "getcompany",
        "output": "atom",
    }
    resp = requests.get(url, params=params, headers=EDGAR_HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()

    # Parse CIK from the Atom XML response
    match = re.search(r"CIK=(\d+)", resp.text)
    if match:
        return match.group(1)
    return None


# --- DynamoDB Operations ---

def get_all_watchlist_ciks(db) -> dict[str, list[str]]:
    """Get all watched CIKs grouped by CIK -> list of subscriber emails.

    Returns: {"1234567": ["user1@example.com", "user2@example.com"], ...}
    """
    table = db.Table(WATCHLISTS_TABLE)
    response = table.scan()
    items = response.get("Items", [])

    # Handle pagination
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))

    cik_to_emails = {}
    for item in items:
        cik = item["cik"]
        email = item["email"]
        if cik not in cik_to_emails:
            cik_to_emails[cik] = []
        cik_to_emails[cik].append(email)

    return cik_to_emails


def is_filing_cached(db, accession_number: str) -> bool:
    """Check if we've already processed this filing."""
    table = db.Table(FILINGS_TABLE)
    resp = table.get_item(Key={"accession_number": accession_number})
    return "Item" in resp


def cache_filing(db, filing: dict, summary: str = ""):
    """Store a processed filing in the cache."""
    table = db.Table(FILINGS_TABLE)
    item = {
        "accession_number": filing["accession_number"],
        "cik": filing["cik"],
        "company_name": filing["company_name"],
        "form_type": filing["form_type"],
        "filed_at": filing["filed_at"],
        "primary_document": filing["primary_document"],
        "description": filing["description"],
        "summary": summary,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
    table.put_item(Item=item)


def get_user_preferences(db, email: str) -> dict:
    """Get a user's digest preferences."""
    table = db.Table(USERS_TABLE)
    resp = table.get_item(Key={"email": email})
    return resp.get("Item", {})


def get_all_active_users(db) -> list[dict]:
    """Get all users with active subscriptions."""
    table = db.Table(USERS_TABLE)
    response = table.scan()
    items = response.get("Items", [])

    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))

    return [u for u in items if u.get("status", "active") == "active"]


def get_user_watchlist(db, email: str) -> list[dict]:
    """Get a user's watchlist entries."""
    table = db.Table(WATCHLISTS_TABLE)
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("email").eq(email),
    )
    return resp.get("Items", [])


def get_recent_filings_for_cik(db, cik: str, since: str) -> list[dict]:
    """Get cached filings for a CIK since a given date."""
    table = db.Table(FILINGS_TABLE)
    resp = table.query(
        IndexName="by-cik",
        KeyConditionExpression=(
            boto3.dynamodb.conditions.Key("cik").eq(cik)
            & boto3.dynamodb.conditions.Key("filed_at").gte(since)
        ),
    )
    return resp.get("Items", [])


# --- AI Summarization ---

def summarize_filing(filing: dict, filing_text: str, bedrock_client) -> str:
    """Generate a plain-language summary of a filing using Claude on Bedrock."""
    prompt = f"""Summarize this SEC {filing['form_type']} filing from {filing['company_name']} in 2-3 sentences.
Focus on what matters to an investor: material events, financial changes, risk factors, or strategic shifts.
Be specific about numbers, dates, and parties involved. No filler.

Filing text (truncated):
{filing_text[:30000]}"""

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 300,
        "messages": [{"role": "user", "content": prompt}],
    })

    response = bedrock_client.invoke_model(modelId=BEDROCK_MODEL_ID, body=body)
    result = json.loads(response["body"].read())
    return result["content"][0]["text"].strip()


# --- Email Delivery ---

def build_digest_html(user_email: str, filings_by_company: dict[str, list[dict]], tickers: list[str] | None = None) -> str:
    """Build the HTML email digest for a user."""
    ticker_line = ""
    if tickers:
        ticker_line = f'<p style="color:#666;margin-top:4px;font-size:14px;">Watching: {" &middot; ".join(sorted(tickers))}</p>'

    sections = []

    for company_name, filings in sorted(filings_by_company.items()):
        filing_rows = []
        for f in filings:
            acc_no_dashes = f["accession_number"].replace("-", "")
            padded_cik = pad_cik(f["cik"])
            filing_url = f"https://www.sec.gov/Archives/edgar/data/{padded_cik}/{acc_no_dashes}/{f['primary_document']}"

            summary_html = f"<p style='color:#555;margin:4px 0 12px 0;'>{f.get('summary', '')}</p>" if f.get("summary") else ""

            filing_rows.append(f"""
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;">
                    <a href="{filing_url}" style="color:#1a73e8;font-weight:600;">{f['form_type']}</a>
                    <span style="color:#888;margin-left:8px;">{f['filed_at']}</span>
                    {summary_html}
                </td>
            </tr>""")

        sections.append(f"""
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr>
                <td style="padding:8px 12px;background:#f8f9fa;font-weight:700;font-size:16px;border-bottom:2px solid #dee2e6;">
                    {company_name}
                </td>
            </tr>
            {"".join(filing_rows)}
        </table>""")

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#333;">
    <h1 style="font-size:22px;margin-bottom:4px;">SEC Filing Digest</h1>
    <p style="color:#888;margin-top:0;">{datetime.now(timezone.utc).strftime('%B %d, %Y')}</p>
    {ticker_line}
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">

    {"".join(sections) if sections else "<p>No new filings matching your watchlist today.</p>"}

    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px 0;">
    <p style="font-size:13px;color:#666;margin-bottom:12px;">
        Know someone who tracks SEC filings? <a href="https://sec.zipperdatabrief.com/signup" style="color:#1a73e8;">Share SEC Filing Digest</a>
    </p>
    <p style="font-size:12px;color:#999;">
        You're receiving this because you subscribed to SEC filing alerts on Zipper Data Brief.
        <br><a href="https://sec.zipperdatabrief.com/unsubscribe?email={user_email}" style="color:#999;">Unsubscribe</a>
        | <a href="https://sec.zipperdatabrief.com/dashboard" style="color:#999;">Manage preferences</a>
    </p>
</body>
</html>"""


def send_digest_email(ses_client, to_email: str, html_body: str):
    """Send the digest email via SES."""
    ses_client.send_email(
        Source=SENDER_EMAIL,
        Destination={"ToAddresses": [to_email]},
        Message={
            "Subject": {
                "Data": f"SEC Filing Digest — {datetime.now(timezone.utc).strftime('%b %d, %Y')}",
                "Charset": "UTF-8",
            },
            "Body": {
                "Html": {"Data": html_body, "Charset": "UTF-8"},
            },
        },
        ConfigurationSetName="sec-filing-digest",
    )
    log.info("Sent digest to %s", to_email)


# --- Main Workflows ---

def ingest_filings():
    """Fetch new filings for all watched companies and cache them."""
    db = get_dynamodb()

    cik_to_emails = get_all_watchlist_ciks(db)
    if not cik_to_emails:
        log.info("No watchlist entries found. Nothing to fetch.")
        return

    log.info("Fetching filings for %d watched CIKs", len(cik_to_emails))

    bedrock = None  # lazy load only if we need to summarize
    new_filings_count = 0

    for cik in cik_to_emails:
        try:
            filings = fetch_company_filings(cik, form_types=SUPPORTED_FORM_TYPES)

            # Only process filings from the last 7 days
            cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")

            for filing in filings:
                if filing["filed_at"] < cutoff:
                    continue
                if is_filing_cached(db, filing["accession_number"]):
                    continue

                # New filing — summarize and cache
                log.info("New filing: %s %s from %s", filing["form_type"], filing["accession_number"], filing["company_name"])

                summary = ""
                try:
                    if bedrock is None:
                        bedrock = get_bedrock_client()
                    filing_text = fetch_filing_text(cik, filing["accession_number"], filing["primary_document"])
                    time.sleep(EDGAR_REQUEST_DELAY)
                    summary = summarize_filing(filing, filing_text, bedrock)
                except Exception as e:
                    log.warning("Failed to summarize %s: %s", filing["accession_number"], e)

                cache_filing(db, filing, summary)
                new_filings_count += 1

            time.sleep(EDGAR_REQUEST_DELAY)

        except Exception as e:
            log.error("Failed to fetch filings for CIK %s: %s", cik, e)

    log.info("Ingestion complete. %d new filings cached.", new_filings_count)


def send_digests():
    """Send digest emails to all active users."""
    db = get_dynamodb()
    ses = get_ses_client()

    users = get_all_active_users(db)
    if not users:
        log.info("No active users. Skipping digest send.")
        return

    # Default: filings from the last 24 hours
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%d")

    for user in users:
        email = user["email"]
        cadence = user.get("cadence", "daily")

        # Weekly users only get digests on Mondays
        if cadence == "weekly" and datetime.now(timezone.utc).weekday() != 0:
            continue

        if cadence == "weekly":
            since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")

        watchlist = get_user_watchlist(db, email)
        if not watchlist:
            continue

        # Collect filings per company
        filings_by_company = {}
        for entry in watchlist:
            cik = entry["cik"]
            company_name = entry.get("company_name", cik)
            filings = get_recent_filings_for_cik(db, cik, since)

            # Filter by user's form type preferences if set
            form_prefs = set(entry.get("form_types", []))
            if form_prefs:
                filings = [f for f in filings if f["form_type"] in form_prefs]

            # Filter by keywords if set
            keywords = entry.get("keywords", [])
            if keywords:
                keyword_pattern = re.compile("|".join(re.escape(k) for k in keywords), re.IGNORECASE)
                filings = [f for f in filings if keyword_pattern.search(f.get("summary", "") + " " + f.get("description", ""))]

            if filings:
                filings_by_company[company_name] = filings

        if not filings_by_company:
            log.info("No matching filings for %s. Skipping.", email)
            continue

        tickers = [e.get("ticker", "").upper() for e in watchlist if e.get("ticker")]

        try:
            html_body = build_digest_html(email, filings_by_company, tickers=tickers)
            send_digest_email(ses, email, html_body)
        except Exception as e:
            log.error("Failed to send digest to %s: %s", email, e)

    log.info("Digest send complete. Processed %d users.", len(users))


def main():
    parser = argparse.ArgumentParser(description="SEC Filing Digest Monitor")
    parser.add_argument("--send-digest", action="store_true", help="Send digest emails to all subscribers")
    parser.add_argument("--preview", action="store_true", help="Preview digest HTML in browser (with --send-digest)")
    args = parser.parse_args()

    if args.send_digest:
        log.info("=== Starting digest send ===")
        send_digests()
    else:
        log.info("=== Starting filing ingestion ===")
        ingest_filings()


if __name__ == "__main__":
    main()
