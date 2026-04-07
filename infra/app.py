#!/usr/bin/env python3
import aws_cdk as cdk
from sec_filing_stack import SecFilingStack

app = cdk.App()

SecFilingStack(app, "SecFilingDigestStack", env=cdk.Environment(
    account=app.node.try_get_context("aws_account") or cdk.Aws.ACCOUNT_ID,
    region=app.node.try_get_context("aws_region") or "us-east-1",
))

app.synth()
