/**
 * Test script for image search API
 * Usage: tsx scripts/test-image-search.ts <path-to-image>
 */

import * as fs from 'fs';
import * as path from 'path';

async function testImageSearch(imagePath: string) {
  try {
    // Read image file
    const imageBuffer = fs.readFileSync(imagePath);
    const imageFile = new File([imageBuffer], path.basename(imagePath), {
      type: 'image/jpeg', // Adjust based on file type
    });

    // Create FormData
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('topK', '40');

    console.log(`[Test] Sending image search request for: ${imagePath}`);
    console.log(`[Test] File size: ${imageBuffer.length} bytes`);

    // Make request
    const response = await fetch('http://localhost:3000/api/search/image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Test] Error: ${response.status} ${response.statusText}`);
      console.error(`[Test] Response:`, error);
      return;
    }

    const result = await response.json();
    
    console.log('\n[Test] ✅ Search Results:');
    console.log(`[Test] Match Status: ${result.match.status}`);
    console.log(`[Test] Match Product ID: ${result.match.productId || 'N/A'}`);
    console.log(`[Test] Match Score: ${result.match.score?.toFixed(3) || 'N/A'}`);
    console.log(`[Test] Similar Products: ${result.similars.length}`);
    
    if (result.similars.length > 0) {
      console.log('\n[Test] Top 5 Similar Products:');
      result.similars.slice(0, 5).forEach((product: any, index: number) => {
        console.log(`  ${index + 1}. ${product.title || 'N/A'} (Score: ${product.score.toFixed(3)})`);
        console.log(`     ID: ${product.productId}`);
        console.log(`     Brand: ${product.brand || 'N/A'}, Category: ${product.category || 'N/A'}`);
      });
    }

    console.log('\n[Test] Query Details:');
    console.log(`  Caption: ${result.query.caption.substring(0, 100)}...`);
    console.log(`  Category: ${result.query.attributes.category || 'N/A'}`);
    console.log(`  Brand: ${result.query.attributes.brand || 'N/A'}`);
    console.log(`  Model Code: ${result.query.identifiers.model_code || 'N/A'}`);

  } catch (error: any) {
    console.error('[Test] Fatal error:', error.message);
    process.exit(1);
  }
}

// Get image path from command line
const imagePath = process.argv[2];

if (!imagePath) {
  console.error('Usage: tsx scripts/test-image-search.ts <path-to-image>');
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`Error: Image file not found: ${imagePath}`);
  process.exit(1);
}

testImageSearch(imagePath);
