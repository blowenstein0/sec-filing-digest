import json
import aws_cdk as cdk
from aws_cdk import (
    aws_amplify as amplify,
    aws_bedrock as bedrock,
    aws_certificatemanager as acm,
    aws_dynamodb as dynamodb,
    aws_ec2 as ec2,
    aws_ecr as ecr,
    aws_ecs as ecs,
    aws_elasticloadbalancingv2 as elbv2,
    aws_iam as iam,
    aws_lambda as _lambda,
    aws_lambda_event_sources as lambda_events,
    aws_logs as logs,
    aws_route53 as route53,
    aws_route53_targets as targets,
    aws_s3 as s3,
    aws_s3_assets as s3_assets,
    aws_ses as ses,
    aws_cloudwatch as cloudwatch,
    aws_sns as sns,
    aws_sns_subscriptions as subs,
)
from constructs import Construct


class SecFilingStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # --- VPC (single public subnet, no NAT) ---
        vpc = ec2.Vpc(
            self, "SecFilingVpc",
            max_azs=1,
            nat_gateways=0,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                )
            ],
        )

        # --- Security Group ---
        sg = ec2.SecurityGroup(
            self, "SecFilingSg",
            vpc=vpc,
            description="SEC Filing Digest EC2 security group",
            allow_all_outbound=False,
        )
        sg.add_egress_rule(
            ec2.Peer.any_ipv4(),
            ec2.Port.tcp(443),
            "HTTPS outbound for EDGAR, SES, SSM, Anthropic API",
        )
        sg.add_egress_rule(
            ec2.Peer.any_ipv4(),
            ec2.Port.tcp(80),
            "HTTP outbound for package installs",
        )

        # --- IAM Role ---
        role = iam.Role(
            self, "SecFilingRole",
            assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "AmazonSSMManagedInstanceCore"
                ),
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "CloudWatchAgentServerPolicy"
                ),
            ],
        )
        role.add_to_policy(iam.PolicyStatement(
            actions=["ses:SendEmail", "ses:SendRawEmail"],
            resources=["*"],
        ))
        role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel"],
            resources=["*"],
        ))

        # --- DynamoDB Tables ---

        # Users/subscribers (separate from HN digest users)
        users_table = dynamodb.Table(
            self, "UsersTable",
            table_name="sec-filing-users",
            partition_key=dynamodb.Attribute(
                name="email", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        # Watchlists: each user's tracked companies
        watchlists_table = dynamodb.Table(
            self, "WatchlistsTable",
            table_name="sec-filing-watchlists",
            partition_key=dynamodb.Attribute(
                name="email", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="cik", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        # Filing cache: deduplicate and track processed filings
        filings_table = dynamodb.Table(
            self, "FilingsTable",
            table_name="sec-filing-cache",
            partition_key=dynamodb.Attribute(
                name="accession_number", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )
        filings_table.add_global_secondary_index(
            index_name="by-cik",
            partition_key=dynamodb.Attribute(
                name="cik", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="filed_at", type=dynamodb.AttributeType.STRING
            ),
        )

        # Sessions (for web auth)
        sessions_table = dynamodb.Table(
            self, "SessionsTable",
            table_name="sec-filing-sessions",
            partition_key=dynamodb.Attribute(
                name="token", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            time_to_live_attribute="expiresAt",
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )

        # Magic links (for passwordless auth)
        magic_links_table = dynamodb.Table(
            self, "MagicLinksTable",
            table_name="sec-filing-magic-links",
            partition_key=dynamodb.Attribute(
                name="token", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            time_to_live_attribute="expiresAt",
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )

        # Filing text cache (stripped 10-K/10-Q text)
        filing_text_table = dynamodb.Table(
            self, "FilingTextCacheTable",
            table_name="sec-filing-text-cache",
            partition_key=dynamodb.Attribute(
                name="filing_key", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        # Research logs (agent traces + user feedback)
        research_logs_table = dynamodb.Table(
            self, "ResearchLogsTable",
            table_name="sec-research-logs",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )
        research_logs_table.add_global_secondary_index(
            index_name="by-email",
            partition_key=dynamodb.Attribute(
                name="email", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="created_at", type=dynamodb.AttributeType.STRING
            ),
        )

        # ============================================================
        # RAG: Bedrock Knowledge Base + S3 Vectors
        # ============================================================

        # S3 bucket for filing text documents
        filing_bucket = s3.Bucket(
            self, "FilingTextBucket",
            bucket_name=f"sec-filing-rag-{cdk.Aws.ACCOUNT_ID}",
            removal_policy=cdk.RemovalPolicy.RETAIN,
            lifecycle_rules=[
                s3.LifecycleRule(
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.INFREQUENT_ACCESS,
                            transition_after=cdk.Duration.days(90),
                        ),
                    ],
                ),
            ],
        )

        # KB service role
        kb_role = iam.Role(
            self, "KBRole",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com"),
        )
        kb_role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel"],
            resources=[f"arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0"],
        ))
        kb_role.add_to_policy(iam.PolicyStatement(
            actions=["s3:GetObject", "s3:ListBucket"],
            resources=[filing_bucket.bucket_arn, f"{filing_bucket.bucket_arn}/*"],
        ))
        kb_role.add_to_policy(iam.PolicyStatement(
            actions=[
                "s3vectors:CreateVectorBucket", "s3vectors:PutVectors",
                "s3vectors:GetVectors", "s3vectors:QueryVectors",
                "s3vectors:DeleteVectors", "s3vectors:ListVectorBuckets",
                "s3vectors:CreateIndex", "s3vectors:ListIndexes",
                "s3vectors:DescribeIndex", "s3vectors:DescribeVectorBucket",
            ],
            resources=["*"],
        ))

        # Knowledge Base
        kb = bedrock.CfnKnowledgeBase(
            self, "FilingKB",
            name="sec-filing-kb",
            role_arn=kb_role.role_arn,
            knowledge_base_configuration=bedrock.CfnKnowledgeBase.KnowledgeBaseConfigurationProperty(
                type="VECTOR",
                vector_knowledge_base_configuration=bedrock.CfnKnowledgeBase.VectorKnowledgeBaseConfigurationProperty(
                    embedding_model_arn=f"arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0",
                    embedding_model_configuration=bedrock.CfnKnowledgeBase.EmbeddingModelConfigurationProperty(
                        bedrock_embedding_model_configuration=bedrock.CfnKnowledgeBase.BedrockEmbeddingModelConfigurationProperty(
                            dimensions=1024,
                        ),
                    ),
                ),
            ),
            storage_configuration=bedrock.CfnKnowledgeBase.StorageConfigurationProperty(
                type="S3_VECTORS",
                s3_vectors_configuration=bedrock.CfnKnowledgeBase.S3VectorsConfigurationProperty(
                    bucket_name=f"sec-filing-rag-vectors-{cdk.Aws.ACCOUNT_ID}",
                ),
            ),
        )

        # Data Source (S3 bucket with filing text)
        kb_data_source = bedrock.CfnDataSource(
            self, "FilingDataSource",
            knowledge_base_id=kb.attr_knowledge_base_id,
            name="sec-filings",
            data_source_configuration=bedrock.CfnDataSource.DataSourceConfigurationProperty(
                type="S3",
                s3_configuration=bedrock.CfnDataSource.S3DataSourceConfigurationProperty(
                    bucket_arn=filing_bucket.bucket_arn,
                    inclusion_prefixes=["filings/"],
                ),
            ),
            vector_ingestion_configuration=bedrock.CfnDataSource.VectorIngestionConfigurationProperty(
                chunking_configuration=bedrock.CfnDataSource.ChunkingConfigurationProperty(
                    chunking_strategy="FIXED_SIZE",
                    fixed_size_chunking_configuration=bedrock.CfnDataSource.FixedSizeChunkingConfigurationProperty(
                        max_tokens=1500,
                        overlap_percentage=15,
                    ),
                ),
            ),
        )

        # Lambda: S3 event → StartIngestionJob (async indexing)
        ingest_lambda = _lambda.Function(
            self, "IngestTriggerLambda",
            function_name="sec-filing-ingest-trigger",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="index.handler",
            timeout=cdk.Duration.seconds(30),
            code=_lambda.Code.from_inline(json.dumps({}) and """
import boto3
import os

bedrock_agent = boto3.client("bedrock-agent", region_name="us-east-1")
KB_ID = os.environ["KNOWLEDGE_BASE_ID"]
DS_ID = os.environ["DATA_SOURCE_ID"]

def handler(event, context):
    print(f"S3 event: {event['Records'][0]['s3']['object']['key']}")
    bedrock_agent.start_ingestion_job(
        knowledgeBaseId=KB_ID,
        dataSourceId=DS_ID,
    )
    return {"status": "ingestion started"}
"""),
            environment={
                "KNOWLEDGE_BASE_ID": kb.attr_knowledge_base_id,
                "DATA_SOURCE_ID": kb_data_source.attr_data_source_id,
            },
        )
        ingest_lambda.add_to_role_policy(iam.PolicyStatement(
            actions=["bedrock:StartIngestionJob"],
            resources=[kb.attr_knowledge_base_arn, f"{kb.attr_knowledge_base_arn}/*"],
        ))

        # S3 event notification → Lambda
        ingest_lambda.add_event_source(
            lambda_events.S3EventSource(
                filing_bucket,
                events=[s3.EventType.OBJECT_CREATED],
                filters=[s3.NotificationKeyFilter(prefix="filings/")],
            )
        )

        # Grant EC2 role access to all tables + filing bucket
        for table in [users_table, watchlists_table, filings_table, sessions_table, magic_links_table]:
            table.grant_read_write_data(role)
        filing_bucket.grant_read_write(role)

        # --- CloudWatch Logs ---
        app_log_group = logs.LogGroup(
            self, "AppLogGroup",
            log_group_name="/sec-filing-digest/app",
            retention=logs.RetentionDays.THREE_MONTHS,
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )
        logs.LogGroup(
            self, "CloudInitLogGroup",
            log_group_name="/sec-filing-digest/cloud-init",
            retention=logs.RetentionDays.THREE_MONTHS,
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )

        # --- CloudWatch Agent Config ---
        cw_agent_config = {
            "logs": {
                "logs_collected": {
                    "files": {
                        "collect_list": [
                            {
                                "file_path": "/var/log/sec_monitor.log",
                                "log_group_name": "/sec-filing-digest/app",
                                "log_stream_name": "{instance_id}",
                                "timezone": "UTC",
                            },
                            {
                                "file_path": "/var/log/cloud-init-output.log",
                                "log_group_name": "/sec-filing-digest/cloud-init",
                                "log_stream_name": "{instance_id}",
                                "timezone": "UTC",
                            },
                        ]
                    },
                }
            }
        }

        # --- S3 Assets ---
        script_asset = s3_assets.Asset(self, "MonitorScript", path="../scripts/sec_monitor.py")
        reqs_asset = s3_assets.Asset(self, "Requirements", path="../requirements.txt")
        script_asset.grant_read(role)
        reqs_asset.grant_read(role)

        # --- User Data ---
        user_data = ec2.UserData.for_linux()
        user_data.add_commands(
            "set -euxo pipefail",
            "",
            "# System packages",
            "dnf update -y",
            "dnf install -y python3.12 cronie amazon-cloudwatch-agent",
            "systemctl enable crond",
            "systemctl start crond",
            "",
            "# Download app files from S3",
            "mkdir -p /home/ec2-user/sec-filing-digest",
        )
        user_data.add_s3_download_command(
            bucket=script_asset.bucket,
            bucket_key=script_asset.s3_object_key,
            local_file="/home/ec2-user/sec-filing-digest/sec_monitor.py",
            region="us-east-1",
        )
        user_data.add_s3_download_command(
            bucket=reqs_asset.bucket,
            bucket_key=reqs_asset.s3_object_key,
            local_file="/home/ec2-user/sec-filing-digest/requirements.txt",
            region="us-east-1",
        )
        user_data.add_commands(
            "",
            "# Install Python dependencies",
            "python3.12 -m ensurepip",
            "python3.12 -m pip install -r /home/ec2-user/sec-filing-digest/requirements.txt",
            "",
            "# Create log file",
            "touch /var/log/sec_monitor.log",
            "chown ec2-user:ec2-user /var/log/sec_monitor.log",
            "",
            "# Set up cron jobs for ec2-user",
            "cat > /tmp/sec_crontab << 'CRON'",
            "# Fetch new EDGAR filings daily at 5am EST (10:00 UTC), 2hr before digest send",
            f"0 10 * * * cd /home/ec2-user/sec-filing-digest && FILINGS_TABLE={filings_table.table_name} USERS_TABLE={users_table.table_name} WATCHLISTS_TABLE={watchlists_table.table_name} /usr/bin/python3.12 /home/ec2-user/sec-filing-digest/sec_monitor.py >> /var/log/sec_monitor.log 2>&1",
            "",
            "# Send daily digest at 7am EST (12:00 UTC)",
            f"0 12 * * * cd /home/ec2-user/sec-filing-digest && SEC_SENDER_EMAIL=filings@zipperdatabrief.com FILINGS_TABLE={filings_table.table_name} USERS_TABLE={users_table.table_name} WATCHLISTS_TABLE={watchlists_table.table_name} /usr/bin/python3.12 /home/ec2-user/sec-filing-digest/sec_monitor.py --send-digest >> /var/log/sec_monitor.log 2>&1",
            "CRON",
            "crontab -u ec2-user /tmp/sec_crontab",
            "rm /tmp/sec_crontab",
            "",
            "# Fix ownership",
            "chown -R ec2-user:ec2-user /home/ec2-user/sec-filing-digest",
            "",
            "# Configure and start CloudWatch agent",
            f"cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWCONFIG'",
            json.dumps(cw_agent_config, indent=2),
            "CWCONFIG",
            "/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
        )

        # --- EC2 Instance ---
        instance = ec2.Instance(
            self, "SecFilingInstance",
            instance_type=ec2.InstanceType("t4g.nano"),
            machine_image=ec2.MachineImage.latest_amazon_linux2023(
                cpu_type=ec2.AmazonLinuxCpuType.ARM_64,
            ),
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
            security_group=sg,
            role=role,
            user_data=user_data,
            associate_public_ip_address=True,
        )

        # --- SES Configuration Set ---
        config_set = ses.ConfigurationSet(
            self, "EmailConfigSet",
            configuration_set_name="sec-filing-digest",
        )
        ses.ConfigurationSetEventDestination(
            self, "EmailMetricsToCloudWatch",
            configuration_set=config_set,
            destination=ses.EventDestination.cloud_watch_dimensions([
                ses.CloudWatchDimension(
                    name="ses:configuration-set",
                    source=ses.CloudWatchDimensionSource.MESSAGE_TAG,
                    default_value="sec-filing-digest",
                ),
            ]),
            events=[
                ses.EmailSendingEvent.SEND,
                ses.EmailSendingEvent.DELIVERY,
                ses.EmailSendingEvent.OPEN,
                ses.EmailSendingEvent.CLICK,
                ses.EmailSendingEvent.BOUNCE,
                ses.EmailSendingEvent.COMPLAINT,
            ],
        )

        # Bounce/complaint alerts
        email_alerts_topic = sns.Topic(
            self, "EmailAlertsTopic",
            topic_name="sec-filing-email-alerts",
        )
        email_alerts_topic.add_subscription(
            subs.EmailSubscription("your-email@example.com")
        )

        # --- CloudWatch Dashboard ---
        def ses_metric(name, stat="Sum", period=86400):
            return cloudwatch.Metric(
                namespace="AWS/SES",
                metric_name=name,
                dimensions_map={"ses:configuration-set": "sec-filing-digest"},
                statistic=stat,
                period=cdk.Duration.seconds(period),
            )

        dashboard = cloudwatch.Dashboard(
            self, "SecFilingDashboard",
            dashboard_name="sec-filing-digest",
        )
        dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Emails Sent vs Delivered (daily)",
                left=[ses_metric("Send"), ses_metric("Delivery")],
                width=12, height=6,
            ),
            cloudwatch.GraphWidget(
                title="Opens & Clicks (daily)",
                left=[ses_metric("Open"), ses_metric("Click")],
                width=12, height=6,
            ),
        )
        dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Bounces & Complaints (daily)",
                left=[ses_metric("Bounce"), ses_metric("Complaint")],
                width=12, height=6,
            ),
            cloudwatch.SingleValueWidget(
                title="Active Subscribers",
                metrics=[cloudwatch.Metric(
                    namespace="SecFilingDigest",
                    metric_name="ActiveSubscribers",
                    statistic="Maximum",
                    period=cdk.Duration.seconds(86400),
                )],
                width=12, height=6,
            ),
        )

        # --- Amplify Frontend ---
        github_token = cdk.SecretValue.secrets_manager("sec-filing-digest/github-token")

        amplify_role = iam.Role(
            self, "AmplifyRole",
            assumed_by=iam.CompositePrincipal(
                iam.ServicePrincipal("amplify.amazonaws.com"),
                iam.ServicePrincipal("lambda.amazonaws.com"),
                iam.ServicePrincipal("edgelambda.amazonaws.com"),
            ),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                ),
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "AdministratorAccess-Amplify"
                ),
            ],
        )
        metrics_table = dynamodb.Table.from_table_name(
            self, "MetricsTable", "sec-financial-metrics",
        )
        users_table.grant_read_write_data(amplify_role)
        sessions_table.grant_read_write_data(amplify_role)
        magic_links_table.grant_read_write_data(amplify_role)
        watchlists_table.grant_read_write_data(amplify_role)
        metrics_table.grant_read_data(amplify_role)
        research_logs_table.grant_read_write_data(amplify_role)
        amplify_role.add_to_policy(iam.PolicyStatement(
            actions=["ses:SendEmail", "ses:SendRawEmail"],
            resources=["*"],
        ))
        amplify_role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
            resources=["*"],
        ))
        amplify_role.add_to_policy(iam.PolicyStatement(
            actions=["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"],
            resources=["*"],
        ))

        amplify_app = amplify.CfnApp(
            self, "SecFilingWeb",
            name="sec-filing-digest",
            repository=f"https://github.com/{self.node.try_get_context('github_repo') or 'YOUR_GITHUB_USERNAME/sec-filing-digest'}",
            access_token=github_token.unsafe_unwrap(),
            iam_service_role=amplify_role.role_arn,
            compute_role_arn=amplify_role.role_arn,
            platform="WEB_COMPUTE",
            build_spec=json.dumps({
                "version": 1,
                "applications": [{
                    "appRoot": "web",
                    "frontend": {
                        "phases": {
                            "preBuild": {"commands": ["npm ci"]},
                            "build": {"commands": ["npm run build"]},
                        },
                        "artifacts": {
                            "baseDirectory": ".next",
                            "files": ["**/*"],
                        },
                        "cache": {"paths": ["node_modules/**/*"]},
                    },
                }],
            }),
            environment_variables=[
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="AMPLIFY_MONOREPO_APP_ROOT", value="web",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="APP_REGION", value="us-east-1",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="USERS_TABLE", value=users_table.table_name,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="SESSIONS_TABLE", value=sessions_table.table_name,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="MAGIC_LINKS_TABLE", value=magic_links_table.table_name,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="WATCHLISTS_TABLE", value=watchlists_table.table_name,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="SENDER_EMAIL", value="filings@zipperdatabrief.com",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="BASE_URL", value="https://sec.zipperdatabrief.com",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="NEXT_PUBLIC_BASE_URL", value="https://sec.zipperdatabrief.com",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="BEDROCK_MODEL_ID", value="us.anthropic.claude-haiku-4-5-20251001-v1:0",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="BEDROCK_SONNET_MODEL_ID", value="us.anthropic.claude-sonnet-4-20250514-v1:0",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="METRICS_TABLE", value="sec-financial-metrics",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="RESEARCH_LOGS_TABLE", value="sec-research-logs",
                ),
            ],
        )

        amplify_branch = amplify.CfnBranch(
            self, "MainBranch",
            app_id=amplify_app.attr_app_id,
            branch_name="main",
            enable_auto_build=True,
            framework="Next.js - SSR",
        )

        # --- Custom Domain ---
        brief_zone = route53.HostedZone.from_lookup(
            self, "BriefZone",
            domain_name="zipperdatabrief.com",
        )

        # Amplify domain removed — sec.zipperdatabrief.com now points to Fargate ALB

        # ============================================================
        # FARGATE DEPLOYMENT (no timeout limits, SSE streaming, Opus)
        # ============================================================

        # --- ECR Repository (already exists from prior deploy) ---
        web_repo = ecr.Repository.from_repository_name(
            self, "WebEcrRepo", "sec-filing-web",
        )

        # --- Fargate VPC (2 AZs, public only, no NAT) ---
        fargate_vpc = ec2.Vpc(
            self, "FargateVpc",
            max_azs=2,
            nat_gateways=0,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                ),
            ],
        )

        # --- ACM Certificate ---
        certificate = acm.Certificate(
            self, "WebCert",
            domain_name="sec.zipperdatabrief.com",
            subject_alternative_names=["sec-v2.zipperdatabrief.com"],
            validation=acm.CertificateValidation.from_dns(brief_zone),
        )

        # --- ECS Cluster ---
        cluster = ecs.Cluster(
            self, "WebCluster",
            cluster_name="sec-filing-web",
            vpc=fargate_vpc,
        )

        # --- Fargate Task Role ---
        fargate_task_role = iam.Role(
            self, "FargateTaskRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        )
        for table in [users_table, sessions_table, magic_links_table, watchlists_table, research_logs_table]:
            table.grant_read_write_data(fargate_task_role)
        metrics_table.grant_read_data(fargate_task_role)
        filing_text_table.grant_read_write_data(fargate_task_role)
        filing_bucket.grant_read_write(fargate_task_role)
        fargate_task_role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:Retrieve"],
            resources=[kb.attr_knowledge_base_arn],
        ))
        fargate_task_role.add_to_policy(iam.PolicyStatement(
            actions=["ses:SendEmail", "ses:SendRawEmail"],
            resources=["*"],
        ))
        fargate_task_role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
            resources=["*"],
        ))
        fargate_task_role.add_to_policy(iam.PolicyStatement(
            actions=["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"],
            resources=["*"],
        ))

        # --- Task Definition (ARM64 for cost + native builds) ---
        task_definition = ecs.FargateTaskDefinition(
            self, "WebTaskDef",
            memory_limit_mib=512,
            cpu=256,
            task_role=fargate_task_role,
            runtime_platform=ecs.RuntimePlatform(
                cpu_architecture=ecs.CpuArchitecture.ARM64,
                operating_system_family=ecs.OperatingSystemFamily.LINUX,
            ),
        )

        fargate_log_group = logs.LogGroup(
            self, "FargateWebLogGroup",
            log_group_name="/sec-filing-digest/fargate-web",
            retention=logs.RetentionDays.ONE_MONTH,
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )

        task_definition.add_container(
            "web",
            image=ecs.ContainerImage.from_ecr_repository(web_repo, tag="latest"),
            logging=ecs.LogDrivers.aws_logs(
                stream_prefix="web",
                log_group=fargate_log_group,
            ),
            environment={
                "APP_REGION": "us-east-1",
                "USERS_TABLE": users_table.table_name,
                "SESSIONS_TABLE": sessions_table.table_name,
                "MAGIC_LINKS_TABLE": magic_links_table.table_name,
                "WATCHLISTS_TABLE": watchlists_table.table_name,
                "METRICS_TABLE": "sec-financial-metrics",
                "RESEARCH_LOGS_TABLE": research_logs_table.table_name,
                "SENDER_EMAIL": "filings@zipperdatabrief.com",
                "BASE_URL": "https://sec.zipperdatabrief.com",
                "NEXT_PUBLIC_BASE_URL": "https://sec.zipperdatabrief.com",
                "BEDROCK_MODEL_ID": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
                "BEDROCK_SONNET_MODEL_ID": "us.anthropic.claude-sonnet-4-20250514-v1:0",
                "BEDROCK_OPUS_MODEL_ID": "us.anthropic.claude-opus-4-6-v1",
                "FILING_TEXT_TABLE": filing_text_table.table_name,
                "KNOWLEDGE_BASE_ID": kb.attr_knowledge_base_id,
                "FILING_TEXT_BUCKET": filing_bucket.bucket_name,
                "HOSTNAME": "0.0.0.0",
            },
            port_mappings=[ecs.PortMapping(container_port=3000, protocol=ecs.Protocol.TCP)],
            health_check=ecs.HealthCheck(
                command=["CMD-SHELL", "wget -q --spider http://localhost:3000/ || exit 1"],
                interval=cdk.Duration.seconds(30),
                timeout=cdk.Duration.seconds(5),
                retries=3,
                start_period=cdk.Duration.seconds(60),
            ),
        )

        # --- ALB ---
        alb = elbv2.ApplicationLoadBalancer(
            self, "WebAlb",
            vpc=fargate_vpc,
            internet_facing=True,
            load_balancer_name="sec-filing-web",
        )
        # 65s idle timeout for long research requests
        alb.set_attribute("idle_timeout.timeout_seconds", "65")

        alb.add_listener(
            "HttpRedirect",
            port=80,
            default_action=elbv2.ListenerAction.redirect(
                protocol="HTTPS", port="443", permanent=True,
            ),
        )

        https_listener = alb.add_listener(
            "HttpsListener",
            port=443,
            certificates=[certificate],
            ssl_policy=elbv2.SslPolicy.RECOMMENDED_TLS,
        )

        # --- Fargate Service ---
        fargate_service = ecs.FargateService(
            self, "WebService",
            cluster=cluster,
            task_definition=task_definition,
            desired_count=1,
            assign_public_ip=True,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
        )

        https_listener.add_targets(
            "WebTarget",
            port=3000,
            protocol=elbv2.ApplicationProtocol.HTTP,
            targets=[fargate_service],
            health_check=elbv2.HealthCheck(
                path="/",
                healthy_http_codes="200",
                interval=cdk.Duration.seconds(30),
                timeout=cdk.Duration.seconds(10),
            ),
            deregistration_delay=cdk.Duration.seconds(30),
        )

        # --- Route53: sec-v2 for testing, swap to sec later ---
        route53.ARecord(
            self, "WebARecord",
            zone=brief_zone,
            record_name="sec",
            target=route53.RecordTarget.from_alias(
                targets.LoadBalancerTarget(alb),
            ),
        )

        # --- Outputs ---
        cdk.CfnOutput(self, "EcrRepoUri",
            value=web_repo.repository_uri,
            description="ECR repo for docker push",
        )
        cdk.CfnOutput(self, "AlbDnsName",
            value=alb.load_balancer_dns_name,
        )
        cdk.CfnOutput(self, "FargateLogGroupOutput",
            value=fargate_log_group.log_group_name,
        )

        # --- Outputs ---
        cdk.CfnOutput(self, "InstanceId",
            value=instance.instance_id,
            description="Instance ID for SSM: aws ssm start-session --target <id>",
        )
        cdk.CfnOutput(self, "InstancePublicIp",
            value=instance.instance_public_ip,
        )
        cdk.CfnOutput(self, "AppLogGroupName",
            value=app_log_group.log_group_name,
        )
        cdk.CfnOutput(self, "AmplifyAppUrl",
            value=f"https://main.{amplify_app.attr_default_domain}",
            description="Amplify frontend URL",
        )
