#!/bin/bash

# Script pentru instalarea Poppler pe macOS
# Acest script instalează Homebrew (dacă nu este instalat) și apoi Poppler

set -e

echo "🔍 Verificare Homebrew..."

# Verifică dacă Homebrew este instalat
if command -v brew &> /dev/null; then
    echo "✅ Homebrew este deja instalat"
    BREW_PATH=$(which brew)
    echo "   Locație: $BREW_PATH"
else
    echo "📦 Homebrew nu este instalat. Instalare..."
    echo ""
    echo "⚠️  ATENȚIE: Instalarea Homebrew necesită:"
    echo "   1. Permisiuni de administrator (va cere parola)"
    echo "   2. Xcode Command Line Tools (va fi instalat automat dacă lipsește)"
    echo ""
    read -p "Continuăm cu instalarea Homebrew? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Instalare anulată."
        exit 1
    fi
    
    # Instalează Homebrew
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Adaugă Homebrew la PATH (pentru Apple Silicon Macs)
    if [ -f /opt/homebrew/bin/brew ]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f /usr/local/bin/brew ]; then
        echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

echo ""
echo "🔍 Verificare Poppler..."

# Verifică dacă Poppler este instalat
if command -v pdftoppm &> /dev/null; then
    echo "✅ Poppler este deja instalat"
    pdftoppm -v | head -1
else
    echo "📦 Poppler nu este instalat. Instalare..."
    brew install poppler
    
    # Verifică instalarea
    if command -v pdftoppm &> /dev/null; then
        echo "✅ Poppler instalat cu succes!"
        pdftoppm -v | head -1
    else
        echo "❌ Eroare la instalarea Poppler"
        exit 1
    fi
fi

echo ""
echo "✅ Instalare completă!"
echo ""
echo "📝 Pași următori:"
echo "   1. Repornește serverul Next.js (Ctrl+C și apoi 'npm run dev')"
echo "   2. Încearcă din nou importul PDF"
echo ""





















































