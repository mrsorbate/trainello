#!/bin/bash

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

APP_NAME="trainello"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
BACKEND_PORT="${BACKEND_PORT:-3000}"

error_exit() {
    echo -e "${RED}❌ Fehler: $1${NC}" >&2
    exit 1
}

ensure_env_key() {
    local key="$1"
    local value="$2"
    local file="$3"

    if grep -qE "^${key}=" "$file"; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
    else
        printf '\n%s=%s\n' "$key" "$value" >> "$file"
    fi
}

get_env_value() {
    local key="$1"
    local file="$2"

    grep -E "^${key}=" "$file" | tail -n 1 | sed -E "s/^${key}=//"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo -e "${BLUE}🚀 ${APP_NAME} - Server Setup${NC}\n"

if [ ! -f "docker-compose.yml" ]; then
    error_exit "Bitte im Repository-Root ausführen (docker-compose.yml fehlt)."
fi

if [ "$(id -u)" -ne 0 ]; then
    error_exit "Bitte mit sudo oder als root ausführen."
fi

if ! command_exists git; then
    echo -e "${BLUE}📦 Installiere Git...${NC}"
    apt-get update
    apt-get install -y git
fi

if ! command_exists docker || ! docker compose version >/dev/null 2>&1; then
    echo -e "${BLUE}🐳 Installiere Docker + Compose Plugin...${NC}"
    apt-get update
    apt-get install -y ca-certificates curl gnupg docker.io docker-compose-plugin openssl
    systemctl enable --now docker
fi

echo -e "${GREEN}✓ Docker bereit${NC}\n"

SERVER_IP="${SERVER_IP:-$(hostname -I | awk '{print $1}')}"
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="127.0.0.1"
fi

if [ ! -f ".env" ]; then
    echo -e "${BLUE}🔐 Erstelle .env...${NC}"
    JWT_SECRET="$(openssl rand -base64 32)"
    cat > .env <<EOF
# ${APP_NAME} - Server Setup
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
JWT_SECRET=${JWT_SECRET}
DATABASE_PATH=/app/data/database.sqlite
FRONTEND_URL=http://${SERVER_IP}:${FRONTEND_PORT}
BACKEND_DATA_DIR=./data/backend
BACKEND_UPLOADS_DIR=./data/uploads
EOF
    echo -e "${GREEN}✓ .env erstellt${NC}\n"
else
    echo -e "${YELLOW}⚠️  .env existiert bereits - ergänze fehlende Werte${NC}\n"
    ensure_env_key "BACKEND_PORT" "$BACKEND_PORT" ".env"
    ensure_env_key "FRONTEND_PORT" "$FRONTEND_PORT" ".env"
    ensure_env_key "DATABASE_PATH" "/app/data/database.sqlite" ".env"
    ensure_env_key "FRONTEND_URL" "http://${SERVER_IP}:${FRONTEND_PORT}" ".env"
    ensure_env_key "BACKEND_DATA_DIR" "./data/backend" ".env"
    ensure_env_key "BACKEND_UPLOADS_DIR" "./data/uploads" ".env"
fi

if [ "$COMPOSE_FILE" = "docker-compose.prod.yml" ]; then
    ACME_EMAIL_VALUE="$(get_env_value "ACME_EMAIL" ".env" || true)"
    ensure_env_key "DOMAIN" "trainello.de" ".env"
    ensure_env_key "FRONTEND_URL" "https://trainello.de" ".env"

    if [ -z "$ACME_EMAIL_VALUE" ] || [ "$ACME_EMAIL_VALUE" = "admin@deine-domain.tld" ]; then
        error_exit "Für docker-compose.prod.yml muss ACME_EMAIL in .env gesetzt sein. DOMAIN ist fest auf trainello.de konfiguriert."
    fi
fi

mkdir -p data/backend data/uploads

echo -e "${BLUE}🐳 Starte Container mit ${COMPOSE_FILE}...${NC}"
docker compose --env-file .env -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo -e "\n${GREEN}✅ Setup abgeschlossen${NC}\n"
echo -e "${YELLOW}Zugriff:${NC} http://${SERVER_IP}:${FRONTEND_PORT}"
echo -e "${YELLOW}Status:${NC} docker compose --env-file .env -f ${COMPOSE_FILE} ps"
echo -e "${YELLOW}Logs:${NC}   docker compose --env-file .env -f ${COMPOSE_FILE} logs -f"