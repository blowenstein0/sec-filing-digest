# SEC Filing Digest

## Architecture
- **scripts/sec_monitor.py** — Python script on EC2 that fetches EDGAR filings (every 15min), summarizes with Claude API, sends per-subscriber digests at 7am EST
- **infra/** — CDK stack: EC2 (t4g.nano, ARM, SSM-only), DynamoDB (users/watchlists/filings/sessions/magic-links), SES
- **web/** — Next.js frontend on Amplify at zipperdatabrief.com/sec (TBD)

## Key Details
- AWS region: us-east-1
- Sender email: set via `SENDER_EMAIL` env var
- Admin email: set via `ADMIN_EMAIL` env var
- EDGAR User-Agent: set via `EDGAR_USER_AGENT` env var (SEC requires contact info)
- AI summarization via Bedrock (Claude Haiku): us.anthropic.claude-haiku-4-5-20251001-v1:0
- CDK stack name: SecFilingDigestStack
- DynamoDB tables: sec-filing-users, sec-filing-watchlists, sec-filing-cache, sec-filing-sessions, sec-filing-magic-links
- EDGAR API requires User-Agent header with contact info (SEC policy)
- EDGAR rate limit: 10 req/sec — script uses 150ms delay between requests

## Infrastructure
- Separate from zipper-data-brief (HN digest). Different DynamoDB tables, different EC2 instance, different user base.
- CDK deploys from `infra/` directory
- Push script updates to EC2 via SSM (don't redeploy CDK for script-only changes)

## Research Tool
- Chat-based research at `/research` — agentic LLM (Sonnet for tools, Opus 4.6 for synthesis)
- Tools: `lookup_ticker`, `get_financial_metrics` (DynamoDB cache), `read_filing` (full filing text)
- Pre-normalized XBRL data in `sec-financial-metrics` table (AAPL, BLK, AMZN populated)
- Agent logs + user feedback in `sec-research-logs` table
- Normalizer script: `scripts/normalize_xbrl.py TICKER1 TICKER2 ...`
- Dev server: `cd web && METRICS_TABLE=sec-financial-metrics RESEARCH_LOGS_TABLE=sec-research-logs npm run dev -- -p 3001`
- Auth bypassed in dev mode

## Conventions
- Never ask for confirmation before actions (only pause for force-push to main, deleting prod resources)
- Keep responses short and direct
