#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"
STACK_NAME="SecFilingDigestStack"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_PATH="${SCRIPT_DIR}/sec_monitor.py"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Error: sec_monitor.py not found at ${SCRIPT_PATH}"
  exit 1
fi

# Get instance ID from CloudFormation outputs
echo "=== Finding EC2 instance ==="
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "Error: Could not find instance ID from stack outputs"
  exit 1
fi

echo "Instance: ${INSTANCE_ID}"

# Verify instance is reachable
PING=$(aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
  --region "${REGION}" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text 2>/dev/null || echo "None")

if [ "$PING" != "Online" ]; then
  echo "Error: Instance ${INSTANCE_ID} is not reachable via SSM (status: ${PING})"
  exit 1
fi

# Base64 encode the script to avoid quoting issues
echo "=== Pushing sec_monitor.py ==="
B64=$(base64 < "$SCRIPT_PATH")

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "${INSTANCE_ID}" \
  --document-name "AWS-RunShellScript" \
  --parameters commands="[\"echo '${B64}' | base64 -d > /home/ec2-user/sec-filing-digest/sec_monitor.py\",\"chown ec2-user:ec2-user /home/ec2-user/sec-filing-digest/sec_monitor.py\"]" \
  --region "${REGION}" \
  --query 'Command.CommandId' \
  --output text)

echo "=== Waiting for command ${COMMAND_ID} ==="
aws ssm wait command-executed \
  --command-id "${COMMAND_ID}" \
  --instance-id "${INSTANCE_ID}" \
  --region "${REGION}" 2>/dev/null || true

STATUS=$(aws ssm get-command-invocation \
  --command-id "${COMMAND_ID}" \
  --instance-id "${INSTANCE_ID}" \
  --region "${REGION}" \
  --query 'Status' \
  --output text)

if [ "$STATUS" = "Success" ]; then
  echo "=== Deploy complete ==="
else
  echo "Error: Command failed with status ${STATUS}"
  aws ssm get-command-invocation \
    --command-id "${COMMAND_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --region "${REGION}" \
    --query 'StandardErrorContent' \
    --output text
  exit 1
fi
