#!/bin/bash

# Script simplu pentru instalarea Poppler pe macOS
# Rulează acest script în terminal: bash install-poppler.sh

set -e

echo "🔍 Verificare Poppler..."

# Verifică dacă Poppler este deja instalat
if command -v pdftoppm >/dev/null 2>&1; then
    echo "✅ Poppler este deja instalat!"
    pdftoppm -v | head -1
    exit 0
fi

# Verifică locații comune
if [ -f /opt/homebrew/bin/pdftoppm ]; then
    echo "✅ Poppler găsit la /opt/homebrew/bin/pdftoppm"
    echo "   Adaugă la PATH: export PATH=\"/opt/homebrew/bin:\$PATH\""
    exit 0
fi

if [ -f /usr/local/bin/pdftoppm ]; then
    echo "✅ Poppler găsit la /usr/local/bin/pdftoppm"
    exit 0
fi

echo "❌ Poppler nu este instalat."
echo ""
echo "📦 Instalare Poppler..."
echo ""

# Verifică dacă Homebrew este instalat
if ! command -v brew >/dev/null 2>&1; then
    echo "⚠️  Homebrew nu este instalat."
    echo ""
    echo "Instalează Homebrew mai întâi:"
    echo ""
    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo ""
    echo "Pentru Apple Silicon Macs (M1/M2/M3), după instalare rulează:"
    echo "  echo 'eval \"\$(/opt/homebrew/bin/brew shellenv)\"' >> ~/.zprofile"
    echo "  eval \"\$(/opt/homebrew/bin/brew shellenv)\""
    echo ""
    echo "Apoi rulează din nou acest script pentru a instala Poppler."
    exit 1
fi

echo "✅ Homebrew este instalat. Instalare Poppler..."
brew install poppler

echo ""
echo "✅ Poppler instalat cu succes!"
echo ""
echo "Verificare instalare:"
pdftoppm -v | head -1

echo ""
echo "📝 IMPORTANT: Repornește serverul Next.js pentru ca sistemul să recunoască Poppler!"
echo "   1. Oprește serverul (Ctrl+C)"
echo "   2. Repornește cu: npm run dev"





















































