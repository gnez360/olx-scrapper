#!/usr/bin/env node

/**
 * Test script for OLX Scraper
 * Usage: node test-scraper.js <url> [limit] [date_from]
 * 
 * Examples:
 * node test-scraper.js "https://www.olx.com.br/celulares/estado-mg" 20
 * node test-scraper.js "https://www.olx.com.br/celulares/apple/iphone-16-pro/estado-mg?sf=1" 30 "2024-11-15"
 */

const http = require('http');
const url = require('url');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node test-scraper.js <url> [limit] [date_from]');
  console.error('');
  console.error('Examples:');
  console.error('  node test-scraper.js "https://www.olx.com.br/celulares/estado-mg" 20');
  console.error('  node test-scraper.js "https://www.olx.com.br/celulares/apple/iphone-16-pro/estado-mg?sf=1" 30');
  process.exit(1);
}

const targetUrl = args[0];
const limit = args[1] || 20;
const dateFrom = args[2] || null;

// Build query
const queryParams = new url.URLSearchParams({
  url: targetUrl,
  limit: limit
});

if (dateFrom) {
  queryParams.append('date_from', dateFrom);
}

const apiUrl = `http://localhost:3000/scrape?${queryParams.toString()}`;

console.log('🔍 Testing OLX Scraper');
console.log('========================');
console.log(`📍 Target URL: ${targetUrl}`);
console.log(`⚙️  Limit: ${limit}`);
if (dateFrom) console.log(`📅 Date from: ${dateFrom}`);
console.log(`📡 API URL: ${apiUrl}`);
console.log('');
console.log('⏳ Scraping...');
console.log('');

const startTime = Date.now();

http.get(apiUrl, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const elapsed = Date.now() - startTime;

    try {
      const result = JSON.parse(data);

      if (res.statusCode !== 200) {
        console.error('❌ Error:');
        console.error(JSON.stringify(result, null, 2));
        process.exit(1);
      }

      console.log('✅ Success!\n');
      console.log('📊 Metadata:');
      console.log(`   Total candidates: ${result.meta.total_candidates}`);
      console.log(`   Returned: ${result.meta.returned}/${result.meta.requested_limit}`);
      console.log(`   Scraped at: ${result.meta.scraped_at}`);
      console.log(`   Time: ${elapsed}ms\n`);

      if (result.items && result.items.length > 0) {
        console.log('📦 Items:');
        console.log('');

        result.items.forEach((item, idx) => {
          console.log(`${idx + 1}. ${item.title}`);
          console.log(`   💰 Preço: ${item.price_text} (${item.price ? 'R$ ' + item.price.toFixed(2) : 'N/A'})`);
          console.log(`   📍 Local: ${item.location || 'N/A'}`);
          console.log(`   📅 Data: ${item.date_parsed || item.date_text || 'N/A'}`);
          console.log(`   🔗 Link: ${item.link.substring(0, 60)}...`);
          if (item.image) console.log(`   🖼️  Image: ${item.image.substring(0, 60)}...`);
          console.log('');
        });
      } else {
        console.log('⚠️  No items found');
      }

      process.exit(0);
    } catch (err) {
      console.error('❌ Parse error:');
      console.error(err.message);
      console.error('Response:', data);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('❌ Connection error:');
  console.error(err.message);
  console.error('');
  console.error('Make sure the server is running on http://localhost:3000');
  process.exit(1);
});
