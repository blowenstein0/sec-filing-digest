# SEC Filing Digest

## Architecture
- **scripts/sec_monitor.py** — Python on EC2: fetches EDGAR filings (every 15min), summarizes with Claude Haiku, sends per-subscriber digests at 7am EST
- **scripts/ingest_filings.py** — Fetches filing text, strips HTML/iXBRL, uploads to S3 → triggers Bedrock KB ingestion
- **scripts/normalize_xbrl.py** — Fetches XBRL Company Facts from EDGAR, normalizes metrics into DynamoDB
- **scripts/deploy-web.sh** — Builds Docker image (ARM64), pushes to ECR, forces Fargate redeployment
- **infra/** — CDK stack: EC2, Fargate+ALB, DynamoDB, SES, Bedrock KB, S3 Vectors, ECR
- **web/** — Next.js frontend on Fargate at sec.zipperdatabrief.com

## Key Details
- AWS region: us-east-1
- Sender email: set via `SENDER_EMAIL` env var
- Admin email: set via `ADMIN_EMAIL` env var
- EDGAR User-Agent: set via `EDGAR_USER_AGENT` env var (SEC requires contact info)
- AI summarization via Bedrock (Claude Haiku): us.anthropic.claude-haiku-4-5-20251001-v1:0
- CDK stack name: SecFilingDigestStack
- DynamoDB tables: sec-filing-users, sec-filing-watchlists, sec-filing-cache, sec-filing-sessions, sec-filing-magic-links, sec-filing-text, sec-research-logs
- External DynamoDB table: sec-financial-metrics (XBRL data, populated by normalize_xbrl.py)
- EDGAR API requires User-Agent header with contact info (SEC policy)
- EDGAR rate limit: 10 req/sec — script uses 150ms delay between requests

## Infrastructure
- Separate from zipper-data-brief (HN digest). Different DynamoDB tables, different EC2 instance, different user base.
- CDK deploys from `infra/` directory
- Push script updates to EC2 via SSM (don't redeploy CDK for script-only changes)
- Web frontend: Docker image in ECR (`sec-filing-web`), deployed to Fargate behind ALB
- Deploy web changes: `cd web && ../scripts/deploy-web.sh` (or manually: docker build, push to ECR, `aws ecs update-service --force-new-deployment`)
- ALB idle timeout: 65s (set for long research queries)
- Route53: sec.zipperdatabrief.com → ALB

## Research Tool
- Chat-based research at `/research` — open access (no auth)
- Agentic LLM: Sonnet for tool orchestration, Opus for final synthesis
- Tools: `lookup_ticker`, `get_financial_metrics` (DynamoDB cache), `read_filing` (full filing text), `bedrock_retrieve` (RAG)
- Pre-normalized XBRL data in `sec-financial-metrics` table (AAPL, BLK, AMZN populated)
- Agent logs in `sec-research-logs` table
- Normalizer: `scripts/normalize_xbrl.py TICKER1 TICKER2 ...`
- RAG: Bedrock Knowledge Base + S3 Vectors (1024-dim Titan embeddings), ingests from S3 filing text
- Dev server: `cd web && METRICS_TABLE=sec-financial-metrics RESEARCH_LOGS_TABLE=sec-research-logs npm run dev -- -p 3001`

## Conventions
- Never ask for confirmation before actions (only pause for force-push to main, deleting prod resources)
- Keep responses short and direct
