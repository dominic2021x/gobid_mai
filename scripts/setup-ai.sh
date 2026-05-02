#!/bin/bash

# Script de instalare și configurare pentru sistemul AI RAG
# Rulează: chmod +x scripts/setup-ai.sh && ./scripts/setup-ai.sh

echo "🤖 Setup AI RAG System pentru gobid.ro"
echo "========================================"
echo ""

# Verifică OS
OS="$(uname -s)"
echo "📱 Sistem detectat: $OS"

# Verifică dacă Homebrew este instalat (macOS)
if [[ "$OS" == "Darwin" ]]; then
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew nu este instalat. Instalează-l de la: https://brew.sh"
        exit 1
    fi
    echo "✅ Homebrew găsit"
fi

# Instalează Docker (dacă nu e instalat)
if ! command -v docker &> /dev/null; then
    echo ""
    echo "🐳 Docker nu este instalat..."
    if [[ "$OS" == "Darwin" ]]; then
        echo "📥 Instalăm Docker Desktop pentru macOS..."
        echo "   Deschide: https://www.docker.com/products/docker-desktop"
        echo "   Sau rulează: brew install --cask docker"
        read -p "Apasă Enter după ce ai instalat Docker Desktop..."
    elif [[ "$OS" == "Linux" ]]; then
        echo "📥 Instalează Docker: curl -fsSL https://get.docker.com | sh"
    fi
else
    echo "✅ Docker găsit"
fi

# Instalează Ollama (dacă nu e instalat)
if ! command -v ollama &> /dev/null; then
    echo ""
    echo "🧠 Ollama nu este instalat..."
    if [[ "$OS" == "Darwin" ]]; then
        echo "📥 Instalăm Ollama..."
        brew install ollama
    elif [[ "$OS" == "Linux" ]]; then
        echo "📥 Instalăm Ollama..."
        curl -fsSL https://ollama.ai/install.sh | sh
    fi
    echo "✅ Ollama instalat"
else
    echo "✅ Ollama găsit"
fi

# Pornește Ollama (dacă nu rulează)
if ! pgrep -x "ollama" > /dev/null; then
    echo ""
    echo "🚀 Pornim Ollama..."
    ollama serve &
    sleep 3
    echo "✅ Ollama pornit"
else
    echo "✅ Ollama rulează deja"
fi

# Descarcă modelul LLM
echo ""
echo "📦 Descărcăm modelul LLM (llama3.2)..."
ollama pull llama3.2
echo "✅ Model descărcat"

# Pornește Qdrant (Docker)
echo ""
echo "🗄️  Pornim Qdrant (Docker)..."
if docker ps | grep -q qdrant; then
    echo "✅ Qdrant rulează deja"
else
    docker run -d \
        --name qdrant \
        -p 6333:6333 \
        -p 6334:6334 \
        -v $(pwd)/qdrant_storage:/qdrant/storage:z \
        qdrant/qdrant
    echo "✅ Qdrant pornit"
    sleep 2
fi

# Verifică conexiunea Qdrant
echo ""
echo "🔍 Verificăm conexiunea Qdrant..."
if curl -s http://localhost:6333/collections > /dev/null; then
    echo "✅ Qdrant este accesibil"
else
    echo "⚠️  Qdrant nu răspunde (poate durează puțin să pornească)"
fi

# Verifică conexiunea Ollama
echo ""
echo "🔍 Verificăm conexiunea Ollama..."
if curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "✅ Ollama este accesibil"
else
    echo "⚠️  Ollama nu răspunde (poate durează puțin să pornească)"
fi

echo ""
echo "🎉 Setup complet!"
echo ""
echo "📝 Următorii pași:"
echo "   1. Verifică că .env.local există și e configurat"
echo "   2. Rulează: npx tsx scripts/index-content.ts"
echo "   3. Pornește Next.js: npm run dev"
echo ""

















