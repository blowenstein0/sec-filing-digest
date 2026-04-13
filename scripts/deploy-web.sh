#!/usr/bin/env bash
set -euo pipefail

ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
REGION="us-east-1"
REPO_NAME="sec-filing-web"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"
CLUSTER="sec-filing-web"

echo "=== Logging into ECR ==="
aws ecr get-login-password --region "${REGION}" | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "=== Building Docker image (ARM64) ==="
cd "$(dirname "$0")/../web"
docker build \
  --platform linux/arm64 \
  --build-arg NEXT_PUBLIC_BASE_URL=https://sec.zipperdatabrief.com \
  -t "${REPO_NAME}:latest" \
  .

TAG="$(date +%Y%m%d-%H%M%S)"
echo "=== Tagging and pushing (latest + ${TAG}) ==="
docker tag "${REPO_NAME}:latest" "${ECR_URI}:latest"
docker tag "${REPO_NAME}:latest" "${ECR_URI}:${TAG}"
docker push "${ECR_URI}:latest"
docker push "${ECR_URI}:${TAG}"

# Find the service name
SERVICE=$(aws ecs list-services --cluster "${CLUSTER}" --region "${REGION}" --query 'serviceArns[0]' --output text 2>/dev/null | awk -F/ '{print $NF}')

if [ -z "$SERVICE" ] || [ "$SERVICE" = "None" ]; then
  echo "=== No service found yet. Push complete — deploy CDK first. ==="
  exit 0
fi

echo "=== Forcing new deployment (service: ${SERVICE}) ==="
aws ecs update-service \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --force-new-deployment \
  --region "${REGION}" \
  --no-cli-pager

echo "=== Waiting for service to stabilize... ==="
aws ecs wait services-stable \
  --cluster "${CLUSTER}" \
  --services "${SERVICE}" \
  --region "${REGION}"

echo "=== Deployment complete ==="
