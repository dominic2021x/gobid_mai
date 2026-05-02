#!/bin/bash

# Setup script pentru Edge TTS (Text-to-Speech)

echo "🔧 Setting up Edge TTS for natural Romanian voice..."

# Verifică dacă Python este instalat
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 nu este instalat. Te rugăm să instalezi Python 3.8+."
    exit 1
fi

# Instalează edge-tts
echo "📦 Installing edge-tts..."
pip3 install edge-tts

# Verifică instalarea
if command -v edge-tts &> /dev/null; then
    echo "✅ Edge TTS instalat cu succes!"
    
    echo ""
    echo "🔍 Listând voci românești disponibile..."
    edge-tts --list-voices | grep "ro-RO" || echo "Nu s-au găsit voci românești"
    
    echo ""
    echo "🎤 Voci recomandate:"
    echo "  - ro-RO-AlinaNeural (feminină, naturală)"
    echo "  - ro-RO-AndreiNeural (masculină)"
    echo ""
    echo "✅ Setup complet! Edge TTS este gata de utilizare."
else
    echo "❌ Eroare la instalarea Edge TTS"
    exit 1
fi

















