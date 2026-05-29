#!/bin/bash
# Simulate CI locally - runs all quality checks
# Usage: scripts/ci-local.sh

set -e

echo "🚀 Running CI pipeline locally..."
echo ""

# Define color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  echo ""
}

# Function to print success
print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

# Type checking
print_section "1️⃣  Type Checking"
bun run type-check && print_success "Type check passed" || exit 1

# Linting
print_section "2️⃣  Code Quality (Linting)"
bun run lint && print_success "Linting passed" || exit 1

# Format check
print_section "3️⃣  Code Formatting"
bun run format:check && print_success "Format check passed" || exit 1

# Unit tests
print_section "4️⃣  Unit Tests"
bun run test:unit && print_success "Unit tests passed" || exit 1

# Integration tests (optional, requires services)
print_section "5️⃣  Integration Tests (skipping - requires Docker services)"
echo -e "${YELLOW}💡 To run integration tests locally:${NC}"
echo "   1. Start services: docker-compose up -d"
echo "   2. Run: bun run test:integration"
echo ""

# Coverage
print_section "6️⃣  Coverage Report"
bun run test:coverage
print_success "Coverage generated"

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 All CI checks passed locally!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "📊 Coverage report: open coverage/index.html"
echo ""
