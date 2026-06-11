#!/bin/bash

echo "🚀 teamvote+ - Setup & Start"
echo "================================"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js ist nicht installiert!"
    echo "Bitte installiere Node.js von https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js $(node --version) gefunden"
echo ""

# Install backend dependencies
echo "📦 Installiere Backend Dependencies..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "❌ Backend Installation fehlgeschlagen"
    exit 1
fi
cd ..
echo "✓ Backend Dependencies installiert"
echo ""

# Install frontend dependencies
echo "📦 Installiere Frontend Dependencies..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "❌ Frontend Installation fehlgeschlagen"
    exit 1
fi
cd ..
echo "✓ Frontend Dependencies installiert"
echo ""

echo "✅ Setup abgeschlossen!"
echo ""
echo "🎯 Starte die App mit:"
echo "   npm run dev (im Root-Verzeichnis)"
echo ""
echo "Oder starte Backend und Frontend separat:"
echo "   Backend:  cd backend && npm run dev"
echo "   Frontend: cd frontend && npm run dev"
echo ""
