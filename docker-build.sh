#!/bin/bash

# Script para gerenciar o container Docker do Azure DevOps MCP
# Uso: ./docker-build.sh [build|run|stop|logs|push]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="azure-devops-mcp"
IMAGE_TAG="${1:-latest}"
CONTAINER_NAME="azure-devops-mcp"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

build_image() {
    print_info "Building Docker image: $IMAGE_NAME:$IMAGE_TAG"
    docker build -t "$IMAGE_NAME:$IMAGE_TAG" .
    print_success "Docker image built successfully"
}

run_container() {
    print_info "Running container: $CONTAINER_NAME"
    docker-compose up -d
    print_success "Container started. Access at http://localhost:8080"
}

stop_container() {
    print_info "Stopping container: $CONTAINER_NAME"
    docker-compose down
    print_success "Container stopped"
}

show_logs() {
    print_info "Showing logs..."
    docker-compose logs -f
}

check_health() {
    print_info "Checking container health..."
    if docker ps | grep -q "$CONTAINER_NAME"; then
        curl -s http://localhost:8080/health || print_error "Health check failed"
    else
        print_error "Container is not running"
    fi
}

show_usage() {
    echo "Usage: $0 {build|run|stop|logs|health|status}"
    echo ""
    echo "Commands:"
    echo "  build       - Build Docker image"
    echo "  run         - Start container with docker-compose"
    echo "  stop        - Stop container"
    echo "  logs        - Show container logs (follow)"
    echo "  health      - Check container health"
    echo "  status      - Show container status"
}

# Main
case "${2:-build}" in
    build)
        build_image
        ;;
    run)
        run_container
        ;;
    stop)
        stop_container
        ;;
    logs)
        show_logs
        ;;
    health)
        check_health
        ;;
    status)
        print_info "Container status:"
        docker-compose ps
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
