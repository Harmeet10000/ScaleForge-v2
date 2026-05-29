#!/bin/bash
# Test in watch mode with color output
# Usage: scripts/test-watch.sh
# Or: scripts/test-watch.sh [pattern] - e.g., scripts/test-watch.sh unit

set -e

pattern="${1:-'**/*.test.ts'}"

echo "🔍 Starting test watcher..."
echo "📝 Pattern: tests/$pattern"
echo ""
echo "Press Ctrl+C to stop"
echo ""

bun test --watch "tests/$pattern"
