#!/usr/bin/env bash

# Test URLs for OLX Scraper
# Usage: ./test-urls.sh

echo "🧪 OLX Scraper - Test URLs"
echo "=================================="
echo ""

BASE_URL="http://localhost:3000/scrape"

# Test 1: Health check
echo "✓ Test 1: Health check"
curl -s http://localhost:3000/health | jq '.'
echo ""

# Test 2: Basic scrape
echo "✓ Test 2: Basic scrape (iPhone 16 Pro - Minas Gerais)"
URL="https://www.olx.com.br/celulares/apple/iphone-16-pro/estado-mg?sf=1"
curl -s "${BASE_URL}?url=$(echo $URL | jq -sRr @uri)&limit=5" | jq '.meta'
echo ""

# Test 3: With date filter
echo "✓ Test 3: With date filter (last 7 days)"
curl -s "${BASE_URL}?url=$(echo $URL | jq -sRr @uri)&limit=10&date_from=2024-11-12" | jq '.meta'
echo ""

# Test 4: Higher limit
echo "✓ Test 4: Higher limit (50 items)"
curl -s "${BASE_URL}?url=$(echo $URL | jq -sRr @uri)&limit=50" | jq '.meta'
echo ""

# Test 5: Different category
echo "✓ Test 5: Different category (Samsung)"
SAMSUNG_URL="https://www.olx.com.br/celulares/samsung/galaxy/estado-mg"
curl -s "${BASE_URL}?url=$(echo $SAMSUNG_URL | jq -sRr @uri)&limit=10" | jq '.meta'
echo ""

echo "✅ All tests completed!"
