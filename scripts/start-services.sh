#!/bin/bash
# Script pentru pornirea rapidă a serviciilor AI

echo "🚀 Pornim serviciile AI..."

# Pornește Qdrant
if ! docker ps | grep -q qdrant; then
    echo "📦 Pornim Qdrant..."
    docker start qdrant 2>/dev/null || docker run -d --name qdrant -p 6333:6333 -p 6334:6334 -v $(pwd)/qdrant_storage:/qdrant/storage:z qdrant/qdrant
    sleep 2
fi

# Pornește Ollama
if ! pgrep -x "ollama" > /dev/null; then
    echo "🧠 Pornim Ollama..."
    ollama serve > /dev/null 2>&1 &
    sleep 2
fi

echo "✅ Servicii pornite!"
