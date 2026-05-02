#!/bin/bash

# Script pentru reindexarea produselor în Pinecone
# Usage: ./scripts/reindex-products.sh

echo "🔄 Starting product reindexing in Pinecone..."
echo ""

# Make POST request to reindex endpoint
curl -X POST http://localhost:3000/api/reindex/products \
  -H "Content-Type: application/json" \
  -w "\n\nStatus: %{http_code}\n" \
  -v

echo ""
echo "✅ Reindexing complete!"
