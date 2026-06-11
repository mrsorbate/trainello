#!/bin/bash

# ============================================
# teamvote+ - Push Script
# ============================================
# Lokal ausführen zum Code pushen
# Usage: ./push.sh "Deine Commit-Nachricht"

if [ -z "$1" ]; then
    echo "❌ Fehler: Commit-Nachricht erforderlich"
    echo "Beispiel: ./push.sh 'Feature: Login verbessert'"
    exit 1
fi

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}📝 Änderungen staging...${NC}"
git add -A

echo -e "${BLUE}💾 Committing: $1${NC}"
git commit -m "$1"

echo -e "${BLUE}🚀 Pushing zu Repository...${NC}"
git push origin main

echo ""
echo -e "${GREEN}✅ Push erfolgreich!${NC}"
echo ""
echo -e "${YELLOW}⚠️  Nächster Schritt auf dem VPS:${NC}"
echo "  ssh user@your-vps-ip"
echo "  cd trainello"
echo "  ./deploy.sh"
