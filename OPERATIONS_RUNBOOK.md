# Azure DevOps MCP - Operations Runbook

## Quick Reference

### Status Checks

```bash
# Local Docker
curl http://localhost:8080/health
curl http://localhost:8080/ready

# Kubernetes
kubectl get pods -n azure-devops-mcp
kubectl get svc -n azure-devops-mcp
```

### Common Tasks

| Task         | Command                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| Deploy       | `kubectl apply -f k8s/deployment.yaml`                                       |
| Scale        | `kubectl scale deployment azure-devops-mcp -n azure-devops-mcp --replicas=3` |
| Update image | `kubectl set image deployment/azure-devops-mcp -n azure-devops-mcp mcp=...`  |
| View logs    | `kubectl logs -n azure-devops-mcp -f deployment/azure-devops-mcp`            |
| Shell access | `kubectl exec -n azure-devops-mcp <pod-name> -it -- /bin/sh`                 |
| Rollback     | `kubectl rollout undo deployment/azure-devops-mcp -n azure-devops-mcp`       |

---

## Incident Response

### Alert: High Error Rate

**Threshold**: > 5% of requests returning 5xx in 5 minutes

**Response Steps**:

1. Check recent deployments: `kubectl rollout history deployment/azure-devops-mcp -n azure-devops-mcp`
2. View logs: `kubectl logs -n azure-devops-mcp -f deployment/azure-devops-mcp | grep ERROR`
3. Check Azure DevOps connectivity: `curl -H "Authorization: Basic ..." https://dev.azure.com/<org>/_apis/projects?api-version=7.0`
4. If recent deployment, rollback: `kubectl rollout undo deployment/azure-devops-mcp -n azure-devops-mcp`
5. If connectivity issue, verify secrets: `kubectl get secret mcp-secrets -n azure-devops-mcp -o jsonpath='{.data}' | base64 -d`

### Alert: High Memory Usage

**Threshold**: > 400MB heap usage

**Response Steps**:

1. Check pod memory: `kubectl top pods -n azure-devops-mcp`
2. Review requests: `curl http://localhost:8080/metrics -H "Authorization: Bearer <token>" | grep memory`
3. Check for memory leaks: Look for continuously increasing memory
4. Possible causes:
   - Large request handling: Scale up or increase limits
   - Memory leak: Check recent code changes, rollback if needed
   - Cache not cleaning: Review health check cleanup intervals
5. If critical, restart pod: `kubectl delete pod <pod-name> -n azure-devops-mcp`

### Alert: Pod CrashLoopBackOff

**Response Steps**:

1. Get pod status: `kubectl describe pod <pod-name> -n azure-devops-mcp`
2. View logs before crash: `kubectl logs <pod-name> -n azure-devops-mcp --previous`
3. Common causes:
   - Missing environment variables: Check secrets exist
   - Azure DevOps unreachable: Verify network/firewall
   - Startup takes too long: Increase startup probe timeout
4. Debug pod: `kubectl debug -n azure-devops-mcp <pod-name> -it --image=ubuntu`
5. Verify health: `kubectl get pods -n azure-devops-mcp`

---

## Maintenance Windows

### Weekly Tasks

- [ ] Review prometheus metrics for anomalies
- [ ] Check logs for warnings: `kubectl logs -n azure-devops-mcp deployment/azure-devops-mcp | grep WARN`
- [ ] Verify backups are being created
- [ ] Review resource consumption: `kubectl top pods -n azure-devops-mcp`

### Monthly Tasks

- [ ] Test disaster recovery procedures
- [ ] Review and update security group rules
- [ ] Check for available updates: `git log -n 5 --oneline`
- [ ] Performance benchmarking: Load test the API
- [ ] Security scanning: `docker scan azure-devops-mcp:latest`

### Quarterly Tasks

- [ ] Review and renew TLS certificates: `kubectl get certificate -n azure-devops-mcp`
- [ ] Update dependencies: `npm update`
- [ ] Disaster recovery drill
- [ ] Capacity planning review

---

## Configuration Changes

### Update Environment Variables

```bash
# Create new secret
kubectl delete secret mcp-secrets -n azure-devops-mcp
kubectl create secret generic mcp-secrets \
  -n azure-devops-mcp \
  --from-env-file=.env.prod

# Restart pods to pick up new values
kubectl rollout restart deployment/azure-devops-mcp -n azure-devops-mcp

# Verify
kubectl get pods -n azure-devops-mcp
```

### Update Deployment Configuration

```bash
# Edit deployment
kubectl edit deployment/azure-devops-mcp -n azure-devops-mcp

# Or apply new YAML
kubectl apply -f k8s/deployment.yaml

# Monitor rollout
kubectl rollout status deployment/azure-devops-mcp -n azure-devops-mcp -w
```

### Scale Horizontally

```bash
# Automatic scaling (already configured in HPA)
# Manually scale if needed:
kubectl scale deployment azure-devops-mcp \
  -n azure-devops-mcp \
  --replicas=5

# Monitor scaling
kubectl get hpa -n azure-devops-mcp
kubectl get pods -n azure-devops-mcp -w
```

---

## Backup & Restore

### Backup ConfigMap & Secrets

```bash
# Backup all resources in namespace
kubectl get all -n azure-devops-mcp -o yaml > mcp-backup-$(date +%Y%m%d).yaml

# Backup secrets specifically
kubectl get secrets -n azure-devops-mcp -o yaml > mcp-secrets-backup-$(date +%Y%m%d).yaml

# Store backups securely
# Example: Upload to S3
aws s3 cp mcp-backup-*.yaml s3://backup-bucket/mcp/
```

### Restore from Backup

```bash
# Apply backup
kubectl apply -f mcp-backup-20240303.yaml

# Verify restoration
kubectl get all -n azure-devops-mcp
```

---

## Performance Tuning

### Health Check Optimization

Current settings in deployment.yaml:

```yaml
livenessProbe:
  initialDelaySeconds: 10 # Time before first check
  periodSeconds: 30 # Check interval
  timeoutSeconds: 5 # Timeout for check
  failureThreshold: 3 # Retries before restart
```

Tune based on application behavior:

- Slower starts: Increase `initialDelaySeconds`
- Less frequent checks: Increase `periodSeconds`
- Unstable: Increase `failureThreshold`

### Resource Limits

Current settings in deployment.yaml:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

Monitor and adjust:

```bash
# Check usage
kubectl top pods -n azure-devops-mcp

# Update limits
kubectl set resources deployment azure-devops-mcp \
  -n azure-devops-mcp \
  --requests=cpu=500m,memory=512Mi \
  --limits=cpu=1000m,memory=1Gi
```

---

## Debugging Tools

### Access Pod Shell

```bash
# Interactive shell
kubectl exec -n azure-devops-mcp <pod-name> -it -- /bin/sh

# Run single command
kubectl exec -n azure-devops-mcp <pod-name> -- ps aux
```

### Forward Ports

```bash
# Service
kubectl port-forward -n azure-devops-mcp svc/azure-devops-mcp 8080:80

# Debug port (inspect)
kubectl port-forward -n azure-devops-mcp <pod-name> 9229:5005

# Then connect debugger:
# node inspect localhost:9229
```

### Copy Files

```bash
# From pod
kubectl cp azure-devops-mcp/<pod-name>:/var/log/mcp/app.log ./app.log

# To pod
kubectl cp ./config.json azure-devops-mcp/<pod-name>:/app/config.json
```

---

## Monitoring Queries

### CPU Usage

```promql
rate(container_cpu_usage_seconds_total[5m]) * 100
```

### Memory Usage

```promql
container_memory_usage_bytes / 1e6  # in MB
```

### Request Rate

```promql
rate(http_requests_total[5m])
```

### Error Rate

```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

### Request Latency (p95)

```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

---

## Log Locations

### Docker Logs

```bash
# Live logs
docker logs -f <container-id>

# Last 100 lines
docker logs --tail=100 <container-id>

# With timestamps
docker logs -t <container-id>
```

### Kubernetes Logs

```bash
# Current pod
kubectl logs -n azure-devops-mcp <pod-name>

# Follow logs
kubectl logs -n azure-devops-mcp -f <pod-name>

# All pods in deployment
kubectl logs -n azure-devops-mcp -l app=azure-devops-mcp

# Previous pod instance
kubectl logs -n azure-devops-mcp <pod-name> --previous
```

### Application Logs

Logs are sent to:

- stdout (captured by Docker/Kubernetes)
- `/var/log/mcp/` (if enabled)

Format: JSON structured logging with:

- `timestamp`: ISO 8601
- `level`: debug, info, warn, error
- `message`: Log message
- `context`: Additional context

---

## Disaster Recovery

### Backup Daily

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
kubectl get all -n azure-devops-mcp -o yaml > backup-$DATE.yaml
kubectl get secrets,configmaps -n azure-devops-mcp -o yaml > backup-secrets-$DATE.yaml
# Upload to cloud storage
aws s3 cp backup*.yaml s3://backup-bucket/mcp/
```

### Test Recovery Process

```bash
# Simulate full namespace loss
kubectl delete namespace azure-devops-mcp

# Restore from backup
kubectl create namespace azure-devops-mcp
kubectl apply -f backup-20240303.yaml

# Verify
kubectl get all -n azure-devops-mcp
```

### Expected Recovery Time

- **RTO (Recovery Time Objective)**: < 15 minutes
- **RPO (Recovery Point Objective)**: < 1 hour (daily backups)

---

## Contact & Escalation

| Level             | Contact          | Response Time |
| ----------------- | ---------------- | ------------- |
| L1 - Alerts       | On-call engineer | 5 minutes     |
| L2 - Debugging    | DevOps team      | 15 minutes    |
| L3 - Architecture | Platform team    | 30 minutes    |
| L4 - Emergency    | Engineering lead | 1 hour        |

**Escalation Decision Tree**:

1. Is the service serving traffic? If no → escalate L2
2. Are error rates > 10%? If yes → escalate L2
3. Are resources exhausted? If yes → scale up or escalate L3
4. Unknown cause? → Create incident ticket and escalate L3

---

## Knowledge Base

| Topic          | Link                                           |
| -------------- | ---------------------------------------------- |
| Deployment     | [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)     |
| Monitoring     | [MONITORING.md](MONITORING.md)                 |
| Health Checks  | [PHASE3_INTEGRATION.md](PHASE3_INTEGRATION.md) |
| Authentication | [AUTHENTICATION.md](AUTHENTICATION.md)         |
| Docker         | [DOCKER_SETUP.md](DOCKER_SETUP.md)             |

---

## Change Log

### Version 1.0.0 (2026-03-03)

- [x] Initial production readiness
- [x] Kubernetes deployment
- [x] CI/CD pipeline
- [x] Monitoring configuration
- [x] Operations runbook
- [x] Disaster recovery plan

---

**Last Updated**: 2026-03-03  
**Next Review**: 2026-04-03
