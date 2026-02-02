# Deployment

Mission Control Space is hosted on AWS S3 with automatic deployment via GitHub Actions.

## Live URL

http://mission-control-space.s3-website-us-east-1.amazonaws.com

## How It Works

1. Push to `main` branch
2. GitHub Actions builds the app (`npm run build`)
3. Built files are synced to S3 bucket

## AWS Setup

### S3 Bucket
- **Name**: `mission-control-space`
- **Region**: `us-east-1`
- **Static website hosting**: Enabled
- **Index document**: `index.html`

### Bucket Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::mission-control-space/*"
    }
  ]
}
```

### IAM
Uses existing IAM user `deploy-landing-page-quentin` with `S3DeployPolicy` that includes:
- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`
- `s3:ListBucket`
- `s3:PutObjectAcl`

## GitHub Secrets

Required secrets in repository settings:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## Manual Deploy

If needed, build and upload manually:
```bash
npm run build
aws s3 sync dist/ s3://mission-control-space --delete
```

## Notes

- App uses a UUID fallback for HTTP contexts (crypto.randomUUID requires HTTPS)
- No CloudFront/HTTPS needed for internal team use
