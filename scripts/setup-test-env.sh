#!/bin/bash
# Setup local test environment with Docker services
# Usage: scripts/setup-test-env.sh [up|down|status]

set -e

ACTION="${1:-up}"

if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
  echo "❌ Docker and docker-compose are required"
  echo ""
  echo "📌 Install Docker from https://docs.docker.com/get-docker/"
  exit 1
fi

case "$ACTION" in
  up)
    echo "🚀 Starting test services..."
    echo ""
    docker-compose -f docker-compose.yml up -d mongodb redis rabbitmq
    echo ""
    echo "✅ Services started!"
    echo ""
    echo "📌 Services are running at:"
    echo "   - MongoDB: mongodb://localhost:27017"
    echo "   - Redis: localhost:6379"
    echo "   - RabbitMQ: amqp://guest:guest@localhost:5672"
    echo ""
    echo "💡 Run tests with: bun run test:integration"
    ;;

  down)
    echo "🛑 Stopping test services..."
    echo ""
    docker-compose -f docker-compose.yml down
    echo ""
    echo "✅ Services stopped!"
    ;;

  status)
    echo "📊 Service status:"
    echo ""
    docker-compose -f docker-compose.yml ps
    ;;

  logs)
    echo "📋 Service logs:"
    echo ""
    docker-compose -f docker-compose.yml logs -f
    ;;

  *)
    echo "Usage: scripts/setup-test-env.sh [up|down|status|logs]"
    echo ""
    echo "Commands:"
    echo "  up     - Start MongoDB, Redis, RabbitMQ"
    echo "  down   - Stop all services"
    echo "  status - Show service status"
    echo "  logs   - Show service logs"
    exit 1
    ;;
esac
