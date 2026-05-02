#!/bin/bash

# Script pentru instalare rapidă Homebrew + Poppler
# Rulează acest script în terminal și introdu parola când este cerută

set -e

echo "🚀 Instalare Homebrew și Poppler..."
echo ""

# Verifică dacă Homebrew este deja instalat
if command -v brew >/dev/null 2>&1 || [ -f /opt/homebrew/bin/brew ] || [ -f /usr/local/bin/brew ]; then
    echo "✅ Homebrew este deja instalat"
    if [ -f /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
else
    echo "📦 Instalare Homebrew..."
    echo "⚠️  Va fi necesară parola de administrator"
    echo ""
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Adaugă Homebrew la PATH
    if [ -f /opt/homebrew/bin/brew ]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f /usr/local/bin/brew ]; then
        echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

echo ""
echo "📦 Instalare Poppler..."
brew install poppler

echo ""
echo "✅ Verificare instalare..."
pdftoppm -v | head -1

echo ""
echo "✅ Instalare completă!"
echo ""
echo "📝 Următorul pas: Repornește serverul Next.js"
echo "   1. Oprește serverul (Ctrl+C)"
echo "   2. Repornește cu: npm run dev"

