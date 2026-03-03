# Phase 4 - Deployment & Production Guide

## Overview

Complete deployment guide for Azure DevOps MCP server in production environments.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [CI/CD Pipeline](#cicd-pipeline)
4. [Docker Deployment](#docker-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Security Configuration](#security-configuration)
7. [Monitoring & Alerting](#monitoring--alerting)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- Docker 20.10+
- Docker Compose 2.0+ (for local testing)
- kubectl 1.24+ (for Kubernetes)
- Helm 3.0+ (optional, recommended)
- GitHub CLI (for repository management)
- Azure CLI (for Azure resources)

### Required Access

- GitHub repository access (for CI/CD)
- Docker registry access (ghcr.io)
- Kubernetes cluster access (kubeconfig)
- Azure subscription (for Azure DevOps)
- Azure AD tenant configuration

### Environment Variables Required

```bash
# Azure DevOps
ORGANIZATION=your-azure-devops-org
AZURE_DEVOPS_PAT=your-personal-access-token

# Azure AD / Entra ID
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_ID=your-app-id
AZURE_AD_CLIENT_SECRET=your-app-secret

# Server Configuration
TRANSPORT=http
PORT=8080
LOG_LEVEL=info

# Session Management
JWT_SECRET=your-jwt-secret-key

# CORS Configuration
CORS_ORIGIN=https://your-domain.com
```

---

## Environment Setup

### 1. Local Development

```bash
# Clone repository
git clone https://github.com/fsaito-github/azure-devops-mcp-remote.git
cd azure-devops-mcp

# Install dependencies
npm install

# Create .env.local file
cp .env.example .env.local

# Configure .env.local with your values
nano .env.local

# Build project
npm run build

# Run tests
npm test

# Start dev server
npm run dev
```

### 2. Docker Environment

```bash
# Build Docker image
docker build -t azure-devops-mcp:latest .

# Create docker-compose override for local secrets
cat > docker-compose.override.yml << 'EOF'
version: '3.9'
services:
  azure-devops-mcp:
    environment:
      ORGANIZATION: ${ORGANIZATION}
      AZURE_DEVOPS_PAT: ${AZURE_DEVOPS_PAT}
      AZURE_AD_CLIENT_ID: ${AZURE_AD_CLIENT_ID}
      AZURE_AD_CLIENT_SECRET: ${AZURE_AD_CLIENT_SECRET}
      AZURE_AD_TENANT_ID: ${AZURE_AD_TENANT_ID}
      JWT_SECRET: ${JWT_SECRET}
EOF

# Start with docker-compose
docker-compose up -d

# Verify health
curl http://localhost:8080/health
curl http://localhost:8080/ready

# View logs
docker-compose logs -f azure-devops-mcp

# Stop
docker-compose down
```

### 3. Staging Environment

```bash
# Build and push to staging registry
docker build -t staging.example.com/mcp:latest .
docker push staging.example.com/mcp:latest

# Deploy to staging Kubernetes cluster
kubectl config use-context staging-cluster
kubectl apply -f k8s/deployment.yaml

# Verify deployment
kubectl get pods -n azure-devops-mcp
kubectl logs -n azure-devops-mcp -l app=azure-devops-mcp

# Port forward for testing
kubectl port-forward -n azure-devops-mcp svc/azure-devops-mcp 8080:80

# Test
curl http://localhost:8080/health
```

---

## CI/CD Pipeline

### GitHub Actions Configuration

Workflows are configured in `.github/workflows/`:

#### 1. Build & Test Pipeline (`build-test.yml`)

Runs on every push and pull request:

- Setup Node.js environment
- Install dependencies
- Build TypeScript
- Type checking
- Run linter
- Run tests with coverage
- Upload coverage to Codecov

```bash
# Manually trigger workflow
gh workflow run build-test.yml -r main
```

#### 2. Docker Build Pipeline (`docker-build.yml`)

Builds multi-platform Docker images:

- Builds for linux/amd64 and linux/arm64
- Pushes to GitHub Container Registry (ghcr.io)
- Caches layers for faster builds
- Tags with git refs and semantic versions

```bash
# Example tags created:
# - ghcr.io/fsaito-github/azure-devops-mcp:main
# - ghcr.io/fsaito-github/azure-devops-mcp:v1.2.3
# - ghcr.io/fsaito-github/azure-devops-mcp:main-abc123def
```

### Setting Up GitHub Actions Secrets

```bash
# Add required secrets to GitHub
gh secret set AZURE_DEVOPS_PAT --body "your-pat-token"
gh secret set AZURE_AD_CLIENT_ID --body "your-client-id"
gh secret set AZURE_AD_CLIENT_SECRET --body "your-app-secret"
gh secret set AZURE_AD_TENANT_ID --body "your-tenant-id"
gh secret set JWT_SECRET --body "your-jwt-secret"
gh secret set REGISTRY_USERNAME --body "${{ github.actor }}"
```

### Manual Workflow Runs

```bash
# Build & test workflow
gh workflow run build-test.yml -r main

# Docker build workflow
gh workflow run docker-build.yml -r main

# Check workflow status
gh workflow view build-test.yml

# View run history
gh runs list
```

---

## Docker Deployment

### Building for Production

```bash
# Build multi-platform image locally
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t azure-devops-mcp:latest \
  -t azure-devops-mcp:v1.0.0 \
  --push \
  .

# Build image for specific platform
docker build \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  -t azure-devops-mcp:linux-arm64 \
  --platform linux/arm64 \
  .
```

### Running Production Container

```bash
# Create production environment file
cat > .env.prod << 'EOF'
ORGANIZATION=production-org
TRANSPORT=http
PORT=8080
LOG_LEVEL=warn
AZURE_DEVOPS_PAT=${AZURE_DEVOPS_PAT}
AZURE_AD_CLIENT_ID=${AZURE_AD_CLIENT_ID}
AZURE_AD_CLIENT_SECRET=${AZURE_AD_CLIENT_SECRET}
AZURE_AD_TENANT_ID=${AZURE_AD_TENANT_ID}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=https://production.example.com
EOF

# Run with production settings
docker run -d \
  --name mcp-prod \
  --restart unless-stopped \
  --health-cmd='curl -f http://localhost:8080/health || exit 1' \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=3 \
  -p 8080:8080 \
  -p 5005:5005 \
  --env-file .env.prod \
  -v mcp-logs:/var/log/mcp \
  azure-devops-mcp:latest

# Verify container
docker ps | grep mcp-prod
docker logs mcp-prod

# Stop container
docker stop mcp-prod
docker rm mcp-prod
```

### Container Registry Configuration

```bash
# Login to GitHub Container Registry
docker login ghcr.io -u ${{ github.actor }} --password-stdin

# Push to registry
docker tag azure-devops-mcp:latest ghcr.io/fsaito-github/azure-devops-mcp:latest
docker push ghcr.io/fsaito-github/azure-devops-mcp:latest

# Pull from registry
docker pull ghcr.io/fsaito-github/azure-devops-mcp:latest
```

---

## Kubernetes Deployment

### Prerequisites

```bash
# Ensure cluster access
kubectl cluster-info
kubectl get nodes

# Create namespace
kubectl create namespace azure-devops-mcp

# Verify namespace
kubectl get namespaces
```

### Deploy to Kubernetes

```bash
# Apply deployment manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml

# Verify deployment
kubectl get deployments -n azure-devops-mcp
kubectl get pods -n azure-devops-mcp
kubectl get services -n azure-devops-mcp

# Check pod status
kubectl describe pod -n azure-devops-mcp -l app=azure-devops-mcp

# View logs
kubectl logs -n azure-devops-mcp -l app=azure-devops-mcp
kubectl logs -n azure-devops-mcp deployment/azure-devops-mcp

# Follow logs in real-time
kubectl logs -n azure-devops-mcp -f deployment/azure-devops-mcp
```

### Configuring Secrets

```bash
# Create secret from environment file
kubectl create secret generic mcp-secrets \
  -n azure-devops-mcp \
  --from-env-file=.env.prod

# Verify secret
kubectl get secrets -n azure-devops-mcp
kubectl describe secret mcp-secrets -n azure-devops-mcp

# Update secret
kubectl delete secret mcp-secrets -n azure-devops-mcp
kubectl create secret generic mcp-secrets \
  -n azure-devops-mcp \
  --from-env-file=.env.prod

# Or use sealed-secrets for GitOps
# kubectl apply -f k8s/secrets-sealed.yaml
```

### Manual Scaling

```bash
# Scale deployment
kubectl scale deployment azure-devops-mcp \
  -n azure-devops-mcp \
  --replicas=3

# View autoscaling status
kubectl get hpa -n azure-devops-mcp

# Watch deployment scaling
kubectl get pods -n azure-devops-mcp -w
```

### Rolling Updates

```bash
# Update image
kubectl set image deployment/azure-devops-mcp \
  -n azure-devops-mcp \
  mcp=ghcr.io/fsaito-github/azure-devops-mcp:v1.2.0

# Check rollout status
kubectl rollout status deployment/azure-devops-mcp -n azure-devops-mcp

# View rollout history
kubectl rollout history deployment/azure-devops-mcp -n azure-devops-mcp

# Rollback to previous version
kubectl rollout undo deployment/azure-devops-mcp -n azure-devops-mcp
```

---

## Security Configuration

### Network Security

```bash
# Create NetworkPolicy to restrict traffic
kubectl apply -f k8s/network-policy.yaml

# Verify network policies
kubectl get networkpolicies -n azure-devops-mcp
```

### RBAC Configuration

Already configured in `k8s/deployment.yaml`:

- ServiceAccount: `mcp-sa`
- Role: Limited permissions for ConfigMaps and Secrets
- RoleBinding: Connects role to service account

```bash
# Verify RBAC
kubectl get serviceaccounts -n azure-devops-mcp
kubectl get roles -n azure-devops-mcp
kubectl get rolebindings -n azure-devops-mcp
```

### Pod Security

Configured in deployment spec:

- Non-root user (uid: 1000)
- FSGroup for volume permissions
- Read-only root filesystem (configurable)
- Disabled privilege escalation
- Dropped capabilities

### Secrets Management

For production, use sealed-secrets or external-secrets:

```bash
# Install sealed-secrets operator
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Create sealed secret
kubectl create secret generic mcp-secrets \
  -n azure-devops-mcp \
  --from-env-file=.env.prod \
  -o yaml | kubeseal -f - > k8s/secrets-sealed.yaml
```

---

## Monitoring & Alerting

### Prometheus Integration

ServiceMonitor already configured in `k8s/ingress.yaml`:

- Scrapes `/metrics` endpoint
- Interval: 30 seconds
- Timeout: 10 seconds

```bash
# Verify ServiceMonitor
kubectl get servicemonitor -n azure-devops-mcp

# Check Prometheus targets
kubectl port-forward -n prometheus svc/prometheus 9090:9090
# Visit: http://localhost:9090/targets
```

### Available Metrics

- `requests_total` - Total number of requests
- `request_duration_seconds` - Request duration histogram
- `memory_heap_bytes` - Heap memory usage
- `uptime_seconds` - Application uptime
- `health_status` - Current health status

### Grafana Dashboards

Create dashboard with these queries:

```promql
# Request rate
rate(requests_total[5m])

# Average response time
avg(request_duration_seconds_bucket)

# Memory usage
memory_heap_bytes

# Uptime
uptime_seconds
```

### AlertManager Configuration

Create PrometheusRule for alerts:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: mcp-alerts
  namespace: azure-devops-mcp
spec:
  groups:
    - name: azure-devops-mcp
      interval: 30s
      rules:
        - alert: MCPHighErrorRate
          expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
          for: 5m
          annotations:
            summary: "High error rate in MCP"
        - alert: MCPHighMemory
          expr: memory_heap_bytes / 1e9 > 0.4
          for: 5m
          annotations:
            summary: "MCP memory usage is high"
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :8080
# or on Windows
netstat -ano | findstr :8080

# Kill process
kill -9 <PID>
```

### Container Won't Start

```bash
# Check logs
docker logs <container-id>

# Check environment variables
docker inspect <container-id> | grep Env

# Run with interactive shell for debugging
docker run -it --rm azure-devops-mcp:latest /bin/sh
```

### Kubernetes Pod CrashLoopBackOff

```bash
# Check pod status
kubectl describe pod -n azure-devops-mcp <pod-name>

# View logs
kubectl logs -n azure-devops-mcp <pod-name>
kubectl logs -n azure-devops-mcp <pod-name> --previous

# Check resource limits
kubectl top nodes
kubectl top pods -n azure-devops-mcp

# Debug pod
kubectl debug -n azure-devops-mcp <pod-name> -it --image=ubuntu
```

### Health Check Failures

```bash
# Test health endpoint locally
curl -v http://localhost:8080/health

# Test inside pod
kubectl exec -n azure-devops-mcp <pod-name> -- curl http://localhost:8080/health

# Check probes configuration
kubectl get pods -n azure-devops-mcp -o jsonpath='{.items[].spec.containers[].livenessProbe}'
```

### Database Connection Issues

```bash
# Test connectivity to Azure DevOps
curl -v -H "Authorization: Basic $(echo -n ":$PAT" | base64)" \
  https://dev.azure.com/<org>/_apis/projects?api-version=7.0

# Check environment variables
kubectl exec -n azure-devops-mcp <pod-name> -- env | grep AZURE
```

---

## Rollback Procedures

### Docker Image Rollback

```bash
# Stop current container
docker stop mcp-prod

# Run previous version
docker run -d \
  --name mcp-prod \
  --restart unless-stopped \
  -e ORGANIZATION=production-org \
  -p 8080:8080 \
  azure-devops-mcp:v1.0.0
```

### Kubernetes Rollback

```bash
# View rollout history
kubectl rollout history deployment/azure-devops-mcp -n azure-devops-mcp

# Rollback to previous version
kubectl rollout undo deployment/azure-devops-mcp -n azure-devops-mcp

# Rollback to specific version
kubectl rollout undo deployment/azure-devops-mcp -n azure-devops-mcp --to-revision=2

# Check rollback status
kubectl rollout status deployment/azure-devops-mcp -n azure-devops-mcp
```

---

## Performance Optimization

### Container Optimization

```bash
# Build with BuildKit for better caching
DOCKER_BUILDKIT=1 docker build -t azure-devops-mcp:latest .

# Use minimal base image (already done in Dockerfile)
# Check image size
docker images azure-devops-mcp:latest
```

### Kubernetes Optimization

```bash
# Resource recommendations based on metrics
kubectl describe node <node-name>

# Check current resource usage
kubectl top pods -n azure-devops-mcp

# Adjust resource requests/limits as needed
kubectl set resources deployment azure-devops-mcp \
  -n azure-devops-mcp \
  --requests=cpu=250m,memory=256Mi \
  --limits=cpu=500m,memory=512Mi
```

---

## Production Checklist

- [ ] All environment variables configured
- [ ] Secrets management system in place
- [ ] Docker image built and tested
- [ ] CI/CD pipeline configured and tested
- [ ] Kubernetes manifests reviewed and tested
- [ ] RBAC and security policies applied
- [ ] Monitoring and alerting configured
- [ ] Backup and disaster recovery plan
- [ ] Health checks verified working
- [ ] Load testing performed
- [ ] Documentation reviewed
- [ ] Runbook created for operations team

---

**Next**: Phase 4 is nearly complete. Remaining: create deployment runbook and operational procedures.
