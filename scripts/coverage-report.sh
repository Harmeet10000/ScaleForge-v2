#!/bin/bash
# Generate coverage report and open in browser
# Usage: scripts/coverage-report.sh

set -e

echo "📊 Generating coverage report..."
echo ""

bun run test:coverage

echo ""
echo "✅ Coverage report generated!"
echo ""
echo "📁 Coverage directory: coverage/"
echo ""

# Try to open in browser
if command -v open &> /dev/null; then
  echo "🌐 Opening in browser..."
  open coverage/index.html
elif command -v xdg-open &> /dev/null; then
  echo "🌐 Opening in browser..."
  xdg-open coverage/index.html
else
  echo "📌 Open manually: coverage/index.html"
fi
