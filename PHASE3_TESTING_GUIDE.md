# Integration Testing Quick Reference

## 🚀 Quick Commands

### Build & Compilation

```bash
# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run watch

# Check for TypeScript errors
npm run type-check
```

### Testing

```bash
# Run all tests
npm test

# Run only health integration tests
npm test -- health-integration.test.ts

# Run with coverage report
npm test -- --coverage

# Run health integration tests with coverage
npm test -- health-integration.test.ts --coverage
```

### Manual Testing (HTTP Transport)

```bash
# Terminal 1: Start the MCP server with HTTP transport
npm run build
node dist/src/index.js your-organization --transport http --port 8080

# Terminal 2: Test the endpoints

# Test liveness probe
curl http://localhost:8080/health

# Test readiness probe
curl http://localhost:8080/ready

# Test with pretty JSON output
curl http://localhost:8080/health | jq .

# Test readiness with pretty output
curl http://localhost:8080/ready | jq .
```

### Testing with Docker

```bash
# From the project root
cd c:\Users\fabiosaito\ado_mcp\azure-devops-mcp

# Build Docker image
docker build -t azure-devops-mcp:latest .

# Run container (HTTP transport)
docker run -d \
  --name mcp-test \
  -p 8080:8080 \
  -e ORGANIZATION=your-org \
  -e TRANSPORT=http \
  azure-devops-mcp:latest

# Test endpoints
curl http://localhost:8080/health

# View logs
docker logs mcp-test

# Stop container
docker stop mcp-test
docker rm mcp-test

# Or use Makefile if available
make build
make run
curl http://localhost:8080/health
make stop
```

### Using ComposeWith Node.js

```bash
# Run single server instance
npm run build
node dist/src/index.js my-org --transport http --port 8080

# Run in development mode (with TypeScript)
ts-node src/index.ts my-org --transport http --port 8080

# Run with debugging
node --inspect=0.0.0.0:9229 dist/src/index.js my-org --transport http --port 8080
```

---

## 📝 Testing Scenarios

### Scenario 1: Verify Health Endpoint Works

```bash
#!/bin/bash

# Start server
node dist/src/index.js test-org --transport http --port 8080 &
SERVER_PID=$!
sleep 2

# Test endpoint
echo "Testing /health endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "503" ]; then
  echo "✓ /health endpoint works (HTTP $HTTP_CODE)"
else
  echo "✗ /health endpoint failed (HTTP $HTTP_CODE)"
fi

# Clean up
kill $SERVER_PID
```

### Scenario 2: Test All Health Endpoints

```bash
#!/bin/bash

echo "Testing all health endpoints..."

# Health
echo -n "GET /health: "
curl -s http://localhost:8080/health | jq -r '.status'

# Ready
echo -n "GET /ready: "
curl -s http://localhost:8080/ready | jq -r '.ready'

# Detailed (will get 401 without auth)
echo -n "GET /health/detailed: "
curl -s http://localhost:8080/health/detailed | jq -r '.error // .status'

# Metrics (will get 401 without auth)
echo -n "GET /metrics: "
curl -s http://localhost:8080/metrics | jq -r '.error // .timestamp'
```

### Scenario 3: Load Testing

```bash
#!/bin/bash

echo "Running load test (10 concurrent requests)..."

for i in {1..10}; do
  curl -s http://localhost:8080/health &
done

wait
echo "Load test complete"

# Check metrics
echo "Request statistics:"
curl -s http://localhost:8080/metrics | jq '.requests'
```

### Scenario 4: Performance Benchmark

```bash
#!/bin/bash

echo "Benchmarking health endpoint response time..."

for i in {1..100}; do
  time curl -s http://localhost:8080/health > /dev/null
done

echo "Benchmark complete (should see minimal variability)"
```

---

## 🐳 Docker Compose Example

If using docker-compose.yml from Phase 1:

```bash
# Start with docker-compose
docker-compose up -d

# Test health endpoints
curl http://localhost:8080/health

# View logs
docker-compose logs azure-devops-mcp

# Stop all services
docker-compose down
```

---

## 🧪 Integration Test Execution

### Run a Single Test File

```bash
npm test -- health-integration.test.ts
```

### Run Specific Test Suite

```bash
npm test -- -t "GET /health"
npm test -- -t "Concurrent Requests"
npm test -- -t "Singleton"
```

### Run with Verbose Output

```bash
npm test -- --verbose health-integration.test.ts
```

### Run with Coverage Report

```bash
npm test -- --coverage health-integration.test.ts --coveragePathIgnorePatterns='node_modules'
```

### Generate HTML Coverage Report

```bash
npm test -- --coverage --coverageReporters=html
# Open coverage/lcov-report/index.html in browser
```

---

## 🔍 Troubleshooting Commands

### Check if TypeScript compiles

```bash
npm run build
echo "Exit code: $?"
```

### Check if tests compile

```bash
npm test -- --noStackTrace
```

### View current Node version

```bash
node --version
npm --version
```

### Clean build directory

```bash
rm -rf dist
npm run build
```

### Clear npm cache

```bash
npm cache clean --force
npm install
npm run build
```

---

## 📋 Pre-Deployment Checklist

```bash
#!/bin/bash

echo "Pre-deployment checklist:"

# 1. Build
echo -n "1. Building... "
npm run build && echo "✓" || echo "✗"

# 2. Tests
echo -n "2. Running tests... "
npm test && echo "✓" || echo "✗"

# 3. Type check
echo -n "3. Type checking... "
npx tsc --noEmit && echo "✓" || echo "✗"

# 4. Linting
echo -n "4. Linting... "
npm run lint 2>/dev/null && echo "✓" || echo "N/A"

# 5. Manual test
echo -n "5. Manual endpoint test... "
node dist/src/index.js test-org --transport http --port 8080 &
SERVER_PID=$!
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
kill $SERVER_PID
[ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "503" ] && echo "✓ (HTTP $HTTP_CODE)" || echo "✗ (HTTP $HTTP_CODE)"

echo "Checklist complete!"
```

---

## 🚀 Deployment Preparation

### Build for Production

```bash
npm run build
npm test
npm run build
```

### Docker Build

```bash
# Build multi-stage image
docker build -t azure-devops-mcp:latest .

# Test image
docker run --rm -p 8080:8080 azure-devops-mcp:latest

# Verify endpoints work
curl http://localhost:8080/health
```

### GitHub Actions (CI/CD)

```yaml
name: Build and Test

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: 20
      - run: npm install
      - run: npm run build
      - run: npm test
      - run: npm run type-check
```

---

## 📊 Expected Output Examples

### Successful /health Response

```json
{
  "status": "healthy",
  "timestamp": "2026-03-03T10:30:45.123Z",
  "uptime": 305
}
```

### Successful /ready Response

```json
{
  "ready": true,
  "readiness": {
    "mcp_server": true,
    "authentication": true,
    "external_services": true
  },
  "timestamp": "2026-03-03T10:30:45.123Z"
}
```

### Unauthorized Response

```json
{
  "error": "UNAUTHORIZED",
  "message": "Authentication required for detailed health"
}
```

---

## 💡 Tips

1. **Use `jq` for JSON formatting**:

   ```bash
   curl http://localhost:8080/health | jq .
   ```

2. **Load test with `ab` (Apache Bench)**:

   ```bash
   ab -n 100 -c 10 http://localhost:8080/health
   ```

3. **Monitor with `watch`**:

   ```bash
   watch -n 1 'curl -s http://localhost:8080/health | jq .uptime'
   ```

4. **Use environment variables for testing**:
   ```bash
   export PORT=8080
   export ORGANIZATION=test-org
   node dist/src/index.js $ORGANIZATION --port $PORT
   ```

---

**Next**: Run these commands to verify Phase 3 integration is working correctly!
