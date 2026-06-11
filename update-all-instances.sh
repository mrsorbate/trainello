#!/bin/bash

set -u

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

BASE_DIR="${BASE_DIR:-/opt}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
INSTANCE_FILTER="${INSTANCE_FILTER:-*}"

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}❌ Bitte mit sudo oder als root ausführen.${NC}" >&2
  exit 1
fi

echo -e "${BLUE}🔄 teamvote+ - Multi-Instanz Update${NC}"
echo -e "${YELLOW}Base dir:${NC} ${BASE_DIR}"
echo -e "${YELLOW}Compose file:${NC} ${COMPOSE_FILE}"
echo -e "${YELLOW}Filter:${NC} ${INSTANCE_FILTER}"
echo

success_count=0
fail_count=0
skipped_count=0
failed_instances=""

for instance_dir in "${BASE_DIR}"/${INSTANCE_FILTER}; do
  if [ ! -d "${instance_dir}" ]; then
    continue
  fi

  if [ ! -f "${instance_dir}/update-server.sh" ] || [ ! -f "${instance_dir}/.env" ] || [ ! -d "${instance_dir}/.git" ]; then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  instance_name="$(basename "${instance_dir}")"
  echo -e "${BLUE}➡️  Update ${instance_name}${NC}"

  if (
    cd "${instance_dir}" &&
    COMPOSE_FILE="${COMPOSE_FILE}" bash ./update-server.sh
  ); then
    success_count=$((success_count + 1))
    echo -e "${GREEN}✅ ${instance_name} erfolgreich${NC}"
  else
    fail_count=$((fail_count + 1))
    failed_instances="${failed_instances}${instance_name}\n"
    echo -e "${RED}❌ ${instance_name} fehlgeschlagen${NC}"
  fi

  echo

done

echo -e "${BLUE}📊 Zusammenfassung${NC}"
echo -e "${GREEN}Erfolgreich:${NC} ${success_count}"
echo -e "${RED}Fehlgeschlagen:${NC} ${fail_count}"
echo -e "${YELLOW}Übersprungen:${NC} ${skipped_count}"

if [ "${fail_count}" -gt 0 ]; then
  echo
  echo -e "${RED}Fehlgeschlagene Instanzen:${NC}"
  printf "%b" "${failed_instances}"
  exit 1
fi

exit 0
