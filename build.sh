#!/bin/bash
# ── Discord Updater – Build Script ──────────────────────────────────────

set -e

echo ""
echo "╔════════════════════════════════════════╗"
echo "║     Discord Updater – Build Script     ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js ist nicht installiert!"
    echo "   Bitte Node.js von https://nodejs.org/ herunterladen (v18+)"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js v18+ wird benötigt. Aktuell: $(node --version)"
    exit 1
fi

echo "✅ Node.js $(node --version)"

# Install dependencies
echo ""
echo "📦 Installiere Abhängigkeiten..."
npm install

echo ""
echo "🔨 Baue Anwendung..."

# Detect platform
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    npm run build
elif [[ "$OSTYPE" == "darwin"* ]]; then
    npm run build:mac
else
    npm run build:linux
fi

echo ""
echo "✅ Build abgeschlossen! Installer befindet sich im 'dist' Ordner."
echo ""
