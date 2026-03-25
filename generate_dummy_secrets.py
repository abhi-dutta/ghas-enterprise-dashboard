#!/usr/bin/env python3
"""Generate 5000 dummy rows and append to secret_scanning.csv"""
import csv
import random
import hashlib
from datetime import datetime, timedelta

random.seed(42)

CSV_PATH = 'secret_scanning.csv'

# Read existing data
with open(CSV_PATH) as f:
    reader = csv.DictReader(f)
    existing = list(reader)
    fieldnames = reader.fieldnames

max_alert = max(int(r['Alert_Number']) for r in existing)
print(f"Existing rows: {len(existing)}, max alert: {max_alert}")

orgs = [
    'InfoMGHAS-KR', 'CloudNative-Org', 'SecureCode-Inc', 'TechCorp-Dev',
    'DataTeam-Hub', 'InfoMVyasVDemo', 'DevOps-Central', 'im-naga-ghas',
    'FinTech-Platform', 'HealthData-Corp', 'RetailTech-IO', 'AI-Research-Lab',
    'MobileApps-Division', 'InfraOps-Team', 'SecurityAudit-Group',
]

repos = [
    'demo-webgoat', 'repo-webgoat', 'demo-gateway', 'demo-platform',
    'demo-app', 'prod-service', 'repo-toolkit', 'test-microservice',
    'repo-infrastructure', 'project-frontend', 'api-backend', 'auth-service',
    'payment-processor', 'data-pipeline', 'ml-inference-engine',
    'config-manager', 'notification-hub', 'user-portal', 'search-indexer',
    'analytics-dashboard', 'deployment-scripts', 'ci-cd-templates',
    'secret-vault', 'log-aggregator', 'cache-layer', 'queue-worker',
    'file-storage-service', 'monitoring-agent', 'rate-limiter', 'admin-console',
]

secret_types = [
    ('Amazon AWS Secret Access Key', 'amazon_aws_secret_access_key'),
    ('Amazon AWS Access Key ID', 'amazon_aws_access_key_id'),
    ('Azure DevOps Personal Access Token', 'azure_devops_pat'),
    ('Azure Storage Account Access Key', 'azure_storage_account_access_key'),
    ('Azure Cosmosdb Key Identifiable', 'azure_cosmosdb_key_identifiable'),
    ('Google API Key', 'google_api_key'),
    ('GitHub Personal Access Token', 'github_personal_access_token'),
    ('Stripe API Key', 'stripe_api_key'),
    ('Postman API Key', 'postman_api_key'),
    ('Terraform Cloud / Enterprise API Token', 'terraform_cloud_api_token'),
    ('Mailgun API Key', 'mailgun_api_key'),
    ('GoCardless Live Access Token', 'gocardless_live_access_token'),
    ('Msft Email', 'msft_email'),
    ('email', 'email'),
    ('Slack Webhook', 'slack_webhook'),
    ('SendGrid API Key', 'sendgrid_api_key'),
    ('Twilio API Key', 'twilio_api_key'),
    ('NPM Access Token', 'npm_access_token'),
    ('PyPI Upload Token', 'pypi_upload_token'),
    ('Databricks API Token', 'databricks_api_token'),
    ('Shopify Access Token', 'shopify_access_token'),
    ('HashiCorp Vault Token', 'hashicorp_vault_token'),
]

states = ['open', 'resolved', 'dismissed']
validities = ['active', 'inactive', 'unknown']
resolutions = ['false_positive', 'revoked', 'used_in_tests', 'wont_fix', 'pattern_deleted']

location_paths = [
    'src/config/database.yml', 'config/settings.py', '.env', '.env.production',
    'src/js/secretsExample.js', 'terraform/main.tf', 'terraform/variables.tf',
    'k8s/deployment.yaml', 'docker-compose.yml', 'Dockerfile',
    'scripts/deploy.sh', 'ci/.github/workflows/build.yml',
    'src/utils/auth.ts', 'src/api/client.py', 'tests/fixtures/mock_keys.json',
    'notebooks/analysis.ipynb', 'docs/internal/credentials.md',
    'config/application.properties', 'appsettings.json',
    'src/main/resources/application.yml', 'requirements.txt',
    'ansible/vault.yml', 'helm/values.yaml', 'pulumi/Pulumi.dev.yaml',
]

start_date = datetime(2025, 1, 1)
end_date = datetime(2026, 3, 5)
date_range_days = (end_date - start_date).days
NUM_NEW = 5000

new_rows = []
for i in range(NUM_NEW):
    alert_num = max_alert + i + 1
    org = random.choice(orgs)
    repo = random.choice(repos)
    st_name, st_id = random.choice(secret_types)
    state = random.choice(states)
    validity = random.choice(validities)

    created = start_date + timedelta(days=random.randint(0, date_range_days),
                                     hours=random.randint(0, 23),
                                     minutes=random.randint(0, 59),
                                     seconds=random.randint(0, 59))
    updated = created + timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))

    publicly_leaked = random.choice(['True', 'False', 'False', 'False'])
    push_bypassed = random.choice(['True', 'False', 'False', 'False'])

    resolution = ''
    resolved_by = ''
    resolved_at = ''
    if state in ('resolved', 'dismissed'):
        resolution = random.choice(resolutions)
        resolved_by = random.choice(['admin', 'security-bot', 'dev-lead', 'ci-automation', ''])
        resolved_at = (updated + timedelta(days=random.randint(0, 7))).strftime('%Y-%m-%dT%H:%M:%SZ')

    loc_path = random.choice(location_paths)
    start_line = random.randint(1, 200)
    end_line = start_line + random.randint(0, 2)
    start_col = random.randint(1, 80)
    end_col = start_col + random.randint(10, 60)
    blob_sha = hashlib.sha1(f"{org}-{repo}-{alert_num}-{loc_path}".encode()).hexdigest()

    new_rows.append({
        'Alert_Number': str(alert_num),
        'Organization_Name': org,
        'Repository_Name': repo,
        'Secret_Type': st_name,
        'Secret_Type_ID': st_id,
        'State': state,
        'Created_At': created.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'Updated_At': updated.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'URL': f"https://github.com/{org}/{repo}/security/secret-scanning/{alert_num}",
        'Validity': validity,
        'Resolution': resolution,
        'Resolved_By': resolved_by,
        'Resolved_At': resolved_at,
        'Publicly_Leaked': publicly_leaked,
        'Push_Protection_Bypassed': push_bypassed,
        'Location_Path': loc_path,
        'Location_Start_Line': str(start_line),
        'Location_End_Line': str(end_line),
        'Location_Start_Column': str(start_col),
        'Location_End_Column': str(end_col),
        'Location_Blob_Sha': blob_sha,
        'Location_Blob_URL': f"https://api.github.com/repos/{org}/{repo}/git/blobs/{blob_sha}",
        'Locations_URL': f"https://api.github.com/repos/{org}/{repo}/secret-scanning/alerts/{alert_num}/locations",
        'Has_More_Locations': random.choice(['True', 'False']),
    })

with open(CSV_PATH, 'a', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    for row in new_rows:
        writer.writerow(row)

print(f"Added {NUM_NEW} rows. New total: {len(existing) + NUM_NEW}")
