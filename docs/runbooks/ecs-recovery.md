# ECS Recovery Runbook

Use this when ECS tasks are crash-looping or the service is not maintaining desired count.

## Step 1: Diagnose

```bash
# Get the stopped task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster scaleforge-prod \
  --desired-status STOPPED \
  --query 'taskArns[0]' \
  --output text)

# Get stop reason and container exit codes
aws ecs describe-tasks \
  --cluster scaleforge-prod \
  --tasks $TASK_ARN \
  --query 'tasks[0].{stopCode:stopCode,stoppedReason:stoppedReason,containers:containers[*].{name:name,exitCode:exitCode,reason:reason}}'
```

## Step 2: Check logs

```bash
# Fetch last 100 log lines from CloudWatch
aws logs get-log-events \
  --log-group-name /ecs/scaleforge-prod \
  --log-stream-name "ecs/scaleforge-api/$(echo $TASK_ARN | cut -d/ -f3)" \
  --limit 100 \
  --query 'events[*].message' \
  --output text
```

## Step 3: Options

### A — Force new deployment (same image)

```bash
aws ecs update-service \
  --cluster scaleforge-prod \
  --service scaleforge-api \
  --force-new-deployment
```

### B — Roll back to a previous image

```bash
# Find the last good image tag from ECR
aws ecr describe-images \
  --repository-name scaleforge \
  --query 'sort_by(imageDetails,&imagePushedAt)[-3:].imageTags[0]' \
  --output text

# Apply via Terraform with the previous SHA
cd terraform/aws
TF_VAR_image_tag=<previous-sha> terraform apply
```

### C — Scale to zero while fixing (maintenance mode)

```bash
aws ecs update-service \
  --cluster scaleforge-prod \
  --service scaleforge-api \
  --desired-count 0

# Fix the issue, push a new image, then restore
aws ecs update-service \
  --cluster scaleforge-prod \
  --service scaleforge-api \
  --desired-count 2
```

## Step 4: Verify

```bash
# Wait for service stability
aws ecs wait services-stable \
  --cluster scaleforge-prod \
  --services scaleforge-api

# Check health endpoint
curl -f https://scaleforge.dev/api/v1/health
```

## Common Exit Codes

| Code | Cause | Fix |
|---|---|---|
| 1 | Application crashed (unhandled exception) | Check logs, fix code, redeploy |
| 137 | OOM kill (SIGKILL) | Increase ECS task memory limit in Terraform |
| 143 | Graceful shutdown (SIGTERM) | Normal during deployments — not an error |
| 125 | Docker error | Check image exists in ECR |
