"""Tests for SEC filing monitor."""

from scripts.sec_monitor import pad_cik, build_digest_html


def test_pad_cik():
    assert pad_cik("320193") == "0000320193"
    assert pad_cik("0000320193") == "0000320193"
    assert pad_cik("1") == "0000000001"


def test_build_digest_html_empty():
    html = build_digest_html("test@example.com", {})
    assert "No new filings" in html
    assert "test@example.com" in html


def test_build_digest_html_with_filings():
    filings = {
        "Apple Inc.": [
            {
                "accession_number": "0000320193-24-000001",
                "form_type": "8-K",
                "filed_at": "2024-01-15",
                "primary_document": "filing.htm",
                "cik": "320193",
                "summary": "Apple announced quarterly earnings.",
            }
        ]
    }
    html = build_digest_html("test@example.com", filings)
    assert "Apple Inc." in html
    assert "8-K" in html
    assert "quarterly earnings" in html
