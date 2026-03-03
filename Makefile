.PHONY: help build build-prod run stop logs health status clean test dev-setup

# Variáveis
IMAGE_NAME := azure-devops-mcp
IMAGE_TAG := latest
CONTAINER_NAME := azure-devops-mcp
DOCKER_COMPOSE := docker-compose
NPM := npm

help:
	@echo "Azure DevOps MCP - Docker Commands"
	@echo "===================================="
	@echo ""
	@echo "Development:"
	@echo "  make dev        - Start development environment"
	@echo "  make build      - Build Docker image (development)"
	@echo "  make run        - Run container with docker-compose"
	@echo "  make stop       - Stop containers"
	@echo "  make logs       - Show live logs"
	@echo "  make health     - Check container health"
	@echo "  make status     - Show container status"
	@echo ""
	@echo "Testing:"
	@echo "  make test       - Run tests inside container"
	@echo "  make test-local - Run tests locally"
	@echo ""
	@echo "Production:"
	@echo "  make build-prod - Build optimized production image"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean      - Remove containers and volumes"
	@echo "  make clean-all  - Remove everything including images"
	@echo ""

# Development
dev: build run
	@echo "Development environment started!"

build:
	@echo "Building Docker image: $(IMAGE_NAME):$(IMAGE_TAG)"
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .
	@echo "Image built successfully"

build-prod:
	@echo "Building production image..."
	docker build --target runtime -t $(IMAGE_NAME):latest .
	@echo "Production image built"

run:
	@echo "Starting containers with docker-compose..."
	$(DOCKER_COMPOSE) up -d
	@echo "Containers started!"
	@echo "Access at: http://localhost:8080"

stop:
	@echo "Stopping containers..."
	$(DOCKER_COMPOSE) down
	@echo "Containers stopped"

logs:
	$(DOCKER_COMPOSE) logs -f

health:
	@echo "Checking container health..."
	@curl -s http://localhost:8080/health || echo "Health check failed"

status:
	@echo "Container status:"
	@$(DOCKER_COMPOSE) ps

# Testing
test:
	@echo "Running tests in container..."
	$(DOCKER_COMPOSE) exec $(CONTAINER_NAME) npm test

test-local:
	@echo "Running tests locally..."
	$(NPM) test

# Cleanup
clean:
	@echo "Cleaning up containers and volumes..."
	$(DOCKER_COMPOSE) down -v
	@echo "Cleanup complete"

clean-all: clean
	@echo "Removing Docker images..."
	docker rmi $(IMAGE_NAME):$(IMAGE_TAG) || true
	@echo "All cleaned up!"

# Development setup
dev-setup:
	@echo "Setting up development environment..."
	$(NPM) install
	@echo "Setup complete! Run 'make dev' to start"

# Shell access
shell:
	@echo "Opening shell in container..."
	$(DOCKER_COMPOSE) exec $(CONTAINER_NAME) /bin/sh

# Quick validation
validate:
	@echo "Validating Docker setup..."
	@docker --version
	@docker-compose --version
	@echo "Setup is valid!"

.DEFAULT_GOAL := help
