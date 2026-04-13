# SEC Filing Digest

AI-summarized SEC filing alerts delivered to your inbox. Built end-to-end with [Claude Code](https://claude.ai/claude-code).

**Live at [sec.zipperdatabrief.com](https://sec.zipperdatabrief.com)**

## What It Does

SEC Filing Digest monitors SEC EDGAR for new filings, summarizes them with Claude, and sends daily email digests to subscribers based on their watchlist. It also includes a chat-based research tool for deeper financial analysis.

**Email Digests** — Subscribers pick companies to watch. Every morning at 7am EST, they get an email with AI-generated summaries of new 8-Ks, 10-Ks, 10-Qs, 13Fs, proxy statements, and activist filings.

**Research Tool** — A chat interface at `/research` that answers financial questions using an agentic pipeline. It pulls live XBRL data, reads full filing text, and synthesizes answers with citations. Uses Sonnet for tool orchestration and Opus for final synthesis.

## How It Was Built

This entire project — backend scripts, CDK infrastructure, Next.js frontend, agentic research pipeline, eval suite — was built using [Claude Code](https://claude.ai/claude-code) over ~61 commits. No boilerplate generators. No copy-paste from tutorials. Just iterative prompting and shipping.

The development arc:
1. **MVP** — Python script on EC2 that polls EDGAR and sends digest emails via SES
2. **Web frontend** — Next.js app on Amplify with passwordless auth, watchlist management, pricing page
3. **Research agent** — Agentic LLM pipeline with tool use (ticker lookup, XBRL financials, filing text extraction)
4. **RAG** — Bedrock Knowledge Base with S3 Vectors for semantic search over full filing text
5. **Eval suite** — 43 promptfoo tests validating financial accuracy, citation quality, and response format
6. **Fargate migration** — Moved from Amplify SSR to Fargate for long-running research requests (no Lambda timeout)

## Architecture

```
┌──────────────────────────┐
│      SEC EDGAR APIs      │
└─────────┬────────────────┘
          │
┌─────────▼────────────────┐     ┌─────────────────────────┐
│  sec_monitor.py (EC2)    │     │  Next.js on Fargate     │
│  Cron: 5am fetch,        │     │  /research chat UI      │
│        7am send digest   │     │  /dashboard watchlist   │
└─────────┬────────────────┘     └─────────┬───────────────┘
          │                                │
┌─────────▼────────────────┐     ┌─────────▼───────────────┐
│  Bedrock Claude Haiku    │     │  Bedrock Sonnet + Opus  │
│  (summarization)         │     │  (research agent)       │
└─────────┬────────────────┘     └─────────┬───────────────┘
          │                                │
┌─────────▼────────────────────────────────▼───────────────┐
│  DynamoDB: users, watchlists, filings, sessions,         │
│            magic-links, filing-text, research-logs,      │
│            financial-metrics                             │
├──────────────────────────────────────────────────────────┤
│  S3 + Bedrock KB: RAG over full filing text              │
├──────────────────────────────────────────────────────────┤
│  SES: transactional emails + daily digests               │
└──────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Tech |
|-------|------|
| **Backend** | Python 3.12, boto3, SEC EDGAR API |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS |
| **AI** | Claude Haiku (summaries), Sonnet (tool use), Opus (synthesis) via AWS Bedrock |
| **Infrastructure** | AWS CDK (Python), EC2, Fargate, DynamoDB, SES, S3, Bedrock KB, ALB, Route53 |
| **Auth** | Passwordless magic links (DynamoDB-backed sessions) |
| **Eval** | promptfoo (43 tests for research agent accuracy) |

## Project Structure

```
├── scripts/
│   ├── sec_monitor.py       # EDGAR polling, AI summarization, digest emails
│   ├── ingest_filings.py    # Fetch filings → S3 for RAG indexing
│   └── normalize_xbrl.py    # XBRL Company Facts → DynamoDB metrics
├── web/                     # Next.js frontend
│   └── src/
│       ├── app/             # Pages: landing, dashboard, research, signup
│       └── lib/             # EDGAR client, SES, auth, research agent
├── infra/                   # AWS CDK stack
│   ├── sec_filing_stack.py  # All AWS resources
│   └── cdk.json             # CDK config (set your account/repo here)
└── tests/                   # Eval suite
```

## Setup

### Prerequisites

- AWS account with Bedrock model access (Claude Haiku, Sonnet, Opus)
- SES verified sender email
- Node.js 20+, Python 3.12+

### Configuration

1. Copy and fill in your values:

```bash
# infra/cdk.json — set your AWS account ID and GitHub repo
{
  "context": {
    "aws_account": "YOUR_AWS_ACCOUNT_ID",
    "aws_region": "us-east-1",
    "github_repo": "YOUR_GITHUB_USERNAME/sec-filing-digest"
  }
}
```

2. Set environment variables (or use CDK context):

```bash
EDGAR_USER_AGENT="YourApp/1.0 (your-email@example.com)"  # Required by SEC
SENDER_EMAIL="filings@yourdomain.com"
ADMIN_EMAIL="you@example.com"
```

### Deploy Infrastructure

```bash
cd infra
pip install -r requirements.txt
cdk deploy
```

### Run Locally (Web)

```bash
cd web
npm install
METRICS_TABLE=sec-financial-metrics \
RESEARCH_LOGS_TABLE=sec-research-logs \
npm run dev -- -p 3001
```

### Ingest Financial Data

```bash
python3 scripts/normalize_xbrl.py AAPL AMZN BLK
python3 scripts/ingest_filings.py AAPL AMZN BLK
```

## EDGAR Compliance

SEC requires a `User-Agent` header with a company name and contact email on all EDGAR requests. Set this via the `EDGAR_USER_AGENT` environment variable. The scripts enforce a 150ms delay between requests to stay under the 10 req/sec rate limit.
