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

is_env_value_empty() {
    local value="$1"
    [ -z "$(echo "$value" | tr -d '[:space:]')" ]
}

is_interactive_shell() {
    [ -t 0 ] && [ -t 1 ]
}

prompt_env_value() {
    local env_file="$1"
    local key="$2"
    local label="$3"
    local default_value="$4"
    local required="$5"
    local current_value
    local user_input

    current_value="$(get_env_value "$key" "$env_file" || true)"
    if ! is_env_value_empty "$current_value"; then
        return
    fi

    if [ "${SETUP_NONINTERACTIVE:-false}" = "true" ] || ! is_interactive_shell; then
        if ! is_env_value_empty "$default_value"; then
            ensure_env_key "$key" "$default_value" "$env_file"
            echo -e "${YELLOW}⚠️  ${key} war nicht gesetzt und wurde auf ${default_value} gesetzt${NC}"
            return
        fi

        if [ "$required" = "true" ]; then
            error_exit "${key} fehlt und es ist kein Standardwert verfügbar. Bitte in .env setzen."
        fi

        return
    fi

    if ! is_env_value_empty "$default_value"; then
        read -r -p "${label} [${default_value}]: " user_input
        user_input="${user_input:-$default_value}"
    else
        read -r -p "${label}: " user_input
    fi

    while [ "$required" = "true" ] && is_env_value_empty "$user_input"; do
        echo -e "${YELLOW}Bitte einen Wert für ${key} eingeben.${NC}"
        read -r -p "${label}: " user_input
    done

    if ! is_env_value_empty "$user_input"; then
        ensure_env_key "$key" "$user_input" "$env_file"
    fi
}

generate_jwt_secret() {
    openssl rand -base64 32
}

generate_vapid_keys_with_node() {
    node <<'NODE'
const crypto = require('crypto');
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const toBase64Url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
console.log(toBase64Url(ecdh.getPublicKey()));
console.log(toBase64Url(ecdh.getPrivateKey()));
NODE
}

generate_vapid_keys_with_docker() {
    docker run --rm -i node:20-alpine node <<'NODE'
const crypto = require('crypto');
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const toBase64Url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
console.log(toBase64Url(ecdh.getPublicKey()));
console.log(toBase64Url(ecdh.getPrivateKey()));
NODE
}

ensure_prod_env_values() {
    local env_file="$1"
    local domain_value
    local acme_email_default

    domain_value="$(get_env_value "DOMAIN" "$env_file" || true)"
    if is_env_value_empty "$domain_value" || [ "$domain_value" = "app.deine-domain.tld" ]; then
        ensure_env_key "DOMAIN" "" "$env_file"
        prompt_env_value "$env_file" "DOMAIN" "Produktions-Domain" "trainello.de" "true"
        domain_value="$(get_env_value "DOMAIN" "$env_file" || true)"
    fi

    ensure_env_key "FRONTEND_URL" "https://${domain_value}" "$env_file"

    local jwt_secret
    jwt_secret="$(get_env_value "JWT_SECRET" "$env_file" || true)"
    if is_env_value_empty "$jwt_secret" || [ "$jwt_secret" = "change-me-in-production" ]; then
        ensure_env_key "JWT_SECRET" "$(generate_jwt_secret)" "$env_file"
        echo -e "${GREEN}✓ JWT_SECRET automatisch gesetzt${NC}"
    fi

    local acme_email
    acme_email="$(get_env_value "ACME_EMAIL" "$env_file" || true)"
    if is_env_value_empty "$acme_email" || [ "$acme_email" = "admin@deine-domain.tld" ]; then
        acme_email_default="admin@${domain_value}"
        ensure_env_key "ACME_EMAIL" "" "$env_file"
        prompt_env_value "$env_file" "ACME_EMAIL" "E-Mail für Let's Encrypt" "$acme_email_default" "true"
        acme_email="$(get_env_value "ACME_EMAIL" "$env_file" || true)"
    fi

    local vapid_public
    local vapid_private
    vapid_public="$(get_env_value "VAPID_PUBLIC_KEY" "$env_file" || true)"
    vapid_private="$(get_env_value "VAPID_PRIVATE_KEY" "$env_file" || true)"

    if is_env_value_empty "$vapid_public" || is_env_value_empty "$vapid_private"; then
        echo -e "${BLUE}🔔 Erzeuge VAPID-Schlüssel für Push-Benachrichtigungen...${NC}"
        local generated_keys
        if command_exists node; then
            generated_keys="$(generate_vapid_keys_with_node)"
        else
            generated_keys="$(generate_vapid_keys_with_docker)"
        fi

        local generated_public
        local generated_private
        generated_public="$(echo "$generated_keys" | sed -n '1p')"
        generated_private="$(echo "$generated_keys" | sed -n '2p')"

        if is_env_value_empty "$generated_public" || is_env_value_empty "$generated_private"; then
            error_exit "VAPID-Schlüssel konnten nicht erzeugt werden. Bitte VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY manuell in .env setzen."
        fi

        ensure_env_key "VAPID_PUBLIC_KEY" "$generated_public" "$env_file"
        ensure_env_key "VAPID_PRIVATE_KEY" "$generated_private" "$env_file"
        echo -e "${GREEN}✓ VAPID-Schlüssel automatisch gesetzt${NC}"
    fi

    local vapid_subject
    vapid_subject="$(get_env_value "VAPID_SUBJECT" "$env_file" || true)"
    if is_env_value_empty "$vapid_subject"; then
        ensure_env_key "VAPID_SUBJECT" "mailto:${acme_email}" "$env_file"
        echo -e "${GREEN}✓ VAPID_SUBJECT automatisch gesetzt${NC}"
    fi
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
    JWT_SECRET="$(generate_jwt_secret)"
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
    ensure_prod_env_values ".env"
fi

mkdir -p data/backend data/uploads

echo -e "${BLUE}🐳 Starte Container mit ${COMPOSE_FILE}...${NC}"
docker compose --env-file .env -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo -e "\n${GREEN}✅ Setup abgeschlossen${NC}\n"
echo -e "${YELLOW}Zugriff:${NC} http://${SERVER_IP}:${FRONTEND_PORT}"
echo -e "${YELLOW}Status:${NC} docker compose --env-file .env -f ${COMPOSE_FILE} ps"
echo -e "${YELLOW}Logs:${NC}   docker compose --env-file .env -f ${COMPOSE_FILE} logs -f"