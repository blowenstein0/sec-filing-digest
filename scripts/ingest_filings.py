#!/usr/bin/env python3
"""
Fetch SEC filings from EDGAR, strip HTML/iXBRL, and upload to S3
for Bedrock Knowledge Base indexing.

S3 event notification triggers a Lambda that calls StartIngestionJob.

Usage:
  python3 ingest_filings.py AAPL BLK AMZN         # Ingest specific tickers
  python3 ingest_filings.py --form-type 10-Q AAPL  # Ingest 10-Q instead of 10-K
  python3 ingest_filings.py --all-forms AAPL       # Ingest both 10-K and 10-Q
"""

import argparse
import os
import re
import sys
import time

import boto3
import requests

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
FILING_BUCKET = os.environ.get("FILING_TEXT_BUCKET", f"sec-filing-rag-{boto3.client('sts').get_caller_identity()['Account']}")
EDGAR_HEADERS = {"User-Agent": "ZipperDataBrief/1.0 (your-email@example.com)"}
RATE_DELAY = 0.15


def lookup_ticker(ticker):
    url = "https://www.sec.gov/files/company_tickers.json"
    resp = requests.get(url, headers=EDGAR_HEADERS, timeout=15)
    data = resp.json()
    for entry in data.values():
        if entry["ticker"].upper() == ticker.upper():
            return {"cik": str(entry["cik_str"]), "name": entry["title"]}
    return None


def fetch_submissions(cik):
    padded = cik.zfill(10)
    url = f"https://data.sec.gov/submissions/CIK{padded}.json"
    resp = requests.get(url, headers=EDGAR_HEADERS, timeout=15)
    if resp.status_code != 200:
        return None
    return resp.json()


def fetch_and_strip(cik, accession, primary_doc):
    """Fetch filing HTML from EDGAR and strip to clean text (no truncation)."""
    acc_fmt = accession.replace("-", "")
    url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_fmt}/{primary_doc}"
    resp = requests.get(url, headers=EDGAR_HEADERS, timeout=30)
    if resp.status_code != 200:
        return None

    text = resp.text

    # Remove iXBRL hidden blocks
    text = re.sub(r'<div[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>[\s\S]*?</div>', ' ', text, flags=re.IGNORECASE)
    # Remove ix:header blocks
    text = re.sub(r'<ix:header>[\s\S]*?</ix:header>', ' ', text, flags=re.IGNORECASE)
    # Remove ix:/xbrli: namespace elements (keep text content)
    text = re.sub(r'</?(?:ix|xbrli|xbrldi|link|xlink):[^>]*>', ' ', text, flags=re.IGNORECASE)
    # Strip remaining HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Remove XBRL artifacts
    text = re.sub(r'\b(?:us-gaap|dei|srt|country):[A-Za-z]+\b', ' ', text)
    text = re.sub(r'http://(?:fasb\.org|xbrl\.sec\.gov|www\.w3\.org)\S*', ' ', text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    return text


def upload_to_s3(s3_client, ticker, accession, form_type, filing_date, company_name, cik, text):
    key = f"filings/{ticker.upper()}/{accession}.txt"
    s3_client.put_object(
        Bucket=FILING_BUCKET,
        Key=key,
        Body=text.encode("utf-8"),
        ContentType="text/plain",
        Metadata={
            "ticker": ticker.upper(),
            "form_type": form_type,
            "filing_date": filing_date,
            "company_name": company_name,
            "cik": cik,
        },
    )
    return key


def process_ticker(s3_client, ticker, form_types):
    print(f"Processing {ticker.upper()}...")

    company = lookup_ticker(ticker)
    if not company:
        print(f"  ERROR: Ticker {ticker} not found")
        return
    print(f"  {company['name']} (CIK: {company['cik']})")
    time.sleep(RATE_DELAY)

    subs = fetch_submissions(company["cik"])
    if not subs:
        print(f"  ERROR: Could not fetch submissions")
        return
    time.sleep(RATE_DELAY)

    recent = subs["filings"]["recent"]

    for form_type in form_types:
        # Find the latest filing of this type
        found = False
        for i in range(len(recent["form"])):
            if recent["form"][i] != form_type:
                continue

            accession = recent["accessionNumber"][i]
            primary_doc = recent["primaryDocument"][i]
            filing_date = recent["filingDate"][i]

            print(f"  Fetching {form_type} (filed {filing_date}, accession {accession})...")
            time.sleep(RATE_DELAY)

            text = fetch_and_strip(company["cik"], accession, primary_doc)
            if not text:
                print(f"  ERROR: Could not fetch/strip filing text")
                continue

            print(f"  Stripped text: {len(text):,} chars")

            key = upload_to_s3(
                s3_client, ticker, accession, form_type,
                filing_date, company["name"], company["cik"], text,
            )
            print(f"  Uploaded to s3://{FILING_BUCKET}/{key}")
            found = True
            break  # Only the latest filing of each type

        if not found:
            print(f"  No {form_type} found for {ticker}")


def main():
    parser = argparse.ArgumentParser(description="Ingest SEC filings for RAG")
    parser.add_argument("tickers", nargs="*", help="Ticker symbols to process")
    parser.add_argument("--form-type", default="10-K", help="Filing type (default: 10-K)")
    parser.add_argument("--all-forms", action="store_true", help="Ingest both 10-K and 10-Q")
    args = parser.parse_args()

    if not args.tickers:
        print("Usage: python3 ingest_filings.py AAPL BLK AMZN")
        sys.exit(1)

    form_types = ["10-K", "10-Q"] if args.all_forms else [args.form_type]

    s3_client = boto3.client("s3", region_name=AWS_REGION)

    for ticker in args.tickers:
        try:
            process_ticker(s3_client, ticker, form_types)
        except Exception as e:
            print(f"  ERROR: {e}")

        if ticker != args.tickers[-1]:
            time.sleep(RATE_DELAY)

    print("\nDone. S3 event will trigger KB ingestion automatically.")


if __name__ == "__main__":
    main()
