#!/usr/bin/env python3
"""
Fetch XBRL Company Facts from SEC EDGAR and normalize financial metrics.
Stores clean, deduplicated annual data in DynamoDB.

Usage:
  python3 normalize_xbrl.py AAPL BLK AMZN
  python3 normalize_xbrl.py --all  # Process all tickers in watchlist table
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from decimal import Decimal

import boto3
import requests

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
METRICS_TABLE = os.environ.get("METRICS_TABLE", "sec-financial-metrics")
EDGAR_HEADERS = {"User-Agent": "ZipperDataBrief/1.0 (your-email@example.com)"}
RATE_DELAY = 0.15  # 150ms between EDGAR requests

# Multiple XBRL concepts per metric — companies use different tags
METRIC_CONCEPTS = {
    "Revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "SalesRevenueGoodsNet",
    ],
    "Net Income": ["NetIncomeLoss", "ProfitLoss"],
    "Operating Income": [
        "OperatingIncomeLoss",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    ],
    "R&D Expense": [
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
    ],
    "Total Assets": ["Assets"],
    "Stockholders' Equity": [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "Long-term Debt": [
        "LongTermDebt",
        "LongTermDebtNoncurrent",
        "LongTermDebtAndCapitalLeaseObligations",
    ],
    "EPS (Basic)": ["EarningsPerShareBasic"],
    "Cash & Equivalents": [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsAndShortTermInvestments",
    ],
    "Gross Profit": ["GrossProfit"],
    "Cost of Revenue": [
        "CostOfRevenue",
        "CostOfGoodsAndServicesSold",
        "CostOfGoodsSold",
    ],
}

# Balance sheet items are instant (no start date), income statement items are periods
INSTANT_METRICS = {
    "Total Assets",
    "Stockholders' Equity",
    "Long-term Debt",
    "Cash & Equivalents",
}


def fetch_company_facts(cik: str) -> dict:
    """Fetch XBRL Company Facts from EDGAR."""
    padded = cik.zfill(10)
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded}.json"
    resp = requests.get(url, headers=EDGAR_HEADERS, timeout=15)
    if resp.status_code != 200:
        print(f"  ERROR: EDGAR returned {resp.status_code} for CIK {cik}")
        return None
    return resp.json()


def lookup_ticker(ticker: str) -> dict:
    """Resolve ticker to CIK and company name."""
    url = "https://www.sec.gov/files/company_tickers.json"
    resp = requests.get(url, headers=EDGAR_HEADERS, timeout=15)
    data = resp.json()
    for entry in data.values():
        if entry["ticker"].upper() == ticker.upper():
            return {"cik": str(entry["cik_str"]), "name": entry["title"]}
    return None


def extract_period_year(end_date: str) -> int:
    """
    Derive fiscal year from the period end date.
    Most companies' fiscal year ends map to a calendar year.
    e.g., end=2024-09-28 → FY2024, end=2024-12-31 → FY2024
    """
    dt = datetime.strptime(end_date, "%Y-%m-%d")
    # If fiscal year ends in Jan-Mar, it belongs to the prior calendar year's FY
    # e.g., FY ending Jan 2025 is still called FY2024 by most companies
    # But EDGAR's own fy field handles this — we'll use end year directly
    # and let the dedup handle it
    return dt.year


def normalize_metric(data_points: list, is_instant: bool) -> list:
    """
    Normalize XBRL data points for a single metric.
    Returns deduplicated annual values keyed by period end date.
    """
    # Filter to 10-K, full-year only
    if is_instant:
        # Balance sheet: no start date
        filtered = [
            dp for dp in data_points
            if dp["form"] == "10-K" and dp.get("fp") == "FY" and "start" not in dp
        ]
    else:
        # Income statement: has start date (period)
        filtered = [
            dp for dp in data_points
            if dp["form"] == "10-K" and dp.get("fp") == "FY" and "start" in dp
        ]

    # Deduplicate by end date — this is the actual period identifier.
    # Multiple 10-K filings report the same period (for comparatives).
    # They should have the same value; keep the most recently filed.
    by_end = {}
    for dp in filtered:
        end = dp["end"]
        existing = by_end.get(end)
        if not existing or dp["filed"] > existing["filed"]:
            by_end[end] = dp

    # Sort by end date descending, take last 5 years
    sorted_periods = sorted(by_end.values(), key=lambda d: d["end"], reverse=True)[:5]

    results = []
    for dp in sorted_periods:
        results.append({
            "year": extract_period_year(dp["end"]),
            "end_date": dp["end"],
            "value": dp["val"],
            "filed": dp["filed"],
        })

    return results


def extract_all_metrics(facts: dict) -> dict:
    """Extract all normalized financial metrics from Company Facts."""
    us_gaap = facts.get("facts", {}).get("us-gaap", {})
    if not us_gaap:
        return {}

    metrics = {}

    for label, concepts in METRIC_CONCEPTS.items():
        is_instant = label in INSTANT_METRICS

        for concept in concepts:
            fact = us_gaap.get(concept)
            if not fact:
                continue

            # Try USD first, then USD/shares for EPS
            units_key = "USD/shares" if "EPS" in label else "USD"
            data_points = fact.get("units", {}).get(units_key, [])
            if not data_points:
                # Fallback
                data_points = fact.get("units", {}).get("USD", [])
            if not data_points:
                continue

            periods = normalize_metric(data_points, is_instant)
            if periods:
                metrics[label] = {
                    "concept": concept,
                    "periods": periods,
                }
                break  # Found data for this metric, move to next

    return metrics


def store_in_dynamodb(table, ticker: str, company_name: str, cik: str, metrics: dict):
    """Store normalized metrics in DynamoDB."""
    # Convert floats to Decimal for DynamoDB
    def to_decimal(obj):
        if isinstance(obj, float):
            return Decimal(str(obj))
        if isinstance(obj, int):
            return Decimal(str(obj))
        if isinstance(obj, list):
            return [to_decimal(i) for i in obj]
        if isinstance(obj, dict):
            return {k: to_decimal(v) for k, v in obj.items()}
        return obj

    item = {
        "ticker": ticker.upper(),
        "company_name": company_name,
        "cik": cik,
        "metrics": to_decimal(metrics),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

    table.put_item(Item=item)
    print(f"  Stored {len(metrics)} metrics for {ticker.upper()}")


def process_ticker(table, ticker: str):
    """Fetch, normalize, and store metrics for a single ticker."""
    print(f"Processing {ticker.upper()}...")

    # Lookup CIK
    company = lookup_ticker(ticker)
    if not company:
        print(f"  ERROR: Ticker {ticker} not found")
        return
    print(f"  {company['name']} (CIK: {company['cik']})")
    time.sleep(RATE_DELAY)

    # Fetch XBRL facts
    facts = fetch_company_facts(company["cik"])
    if not facts:
        return
    time.sleep(RATE_DELAY)

    # Extract and normalize
    metrics = extract_all_metrics(facts)
    if not metrics:
        print(f"  WARNING: No metrics extracted for {ticker}")
        return

    # Print summary
    for label, data in metrics.items():
        periods_str = ", ".join(
            f"FY{p['year']}: ${p['value']:,.0f}" if abs(p["value"]) >= 1
            else f"FY{p['year']}: ${p['value']:.2f}"
            for p in data["periods"]
        )
        print(f"  {label} ({data['concept']}): {periods_str}")

    # Store
    store_in_dynamodb(table, ticker, company["name"], company["cik"], metrics)


def main():
    parser = argparse.ArgumentParser(description="Normalize XBRL financial data")
    parser.add_argument("tickers", nargs="*", help="Ticker symbols to process")
    parser.add_argument("--dry-run", action="store_true", help="Print metrics without storing")
    args = parser.parse_args()

    if not args.tickers:
        print("Usage: python3 normalize_xbrl.py AAPL BLK AMZN")
        sys.exit(1)

    db = boto3.resource("dynamodb", region_name=AWS_REGION)
    table = db.Table(METRICS_TABLE)

    for ticker in args.tickers:
        try:
            if args.dry_run:
                # Just print, don't store
                company = lookup_ticker(ticker)
                if not company:
                    print(f"Ticker {ticker} not found")
                    continue
                time.sleep(RATE_DELAY)
                facts = fetch_company_facts(company["cik"])
                if not facts:
                    continue
                metrics = extract_all_metrics(facts)
                print(f"\n{ticker.upper()} — {company['name']}:")
                for label, data in metrics.items():
                    periods_str = ", ".join(
                        f"FY{p['year']}: ${p['value']:,.0f}" if abs(p["value"]) >= 1
                        else f"FY{p['year']}: ${p['value']:.2f}"
                        for p in data["periods"]
                    )
                    print(f"  {label}: {periods_str}")
            else:
                process_ticker(table, ticker)
        except Exception as e:
            print(f"  ERROR processing {ticker}: {e}")

        if ticker != args.tickers[-1]:
            time.sleep(RATE_DELAY)

    print("\nDone.")


if __name__ == "__main__":
    main()
