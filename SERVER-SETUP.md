# teamvote+ auf einem Server installieren

Diese Anleitung ist für einen blanken Linux-Server gedacht und nutzt Docker Compose.

## Variante A: Ohne Domain, direkt per Server-IP

Das ist die schnellste Variante. Die App läuft dann über `http://SERVER-IP:8080`.

### 1. Server vorbereiten

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

### 2. Repository klonen

```bash
cd /opt
sudo git clone https://github.com/mrsorbate/trainello.git
cd trainello
```

### 3. Setup starten

```bash
sudo bash ./setup-server.sh
```

Wenn die Installation fertig ist, ist die App normalerweise unter `http://SERVER-IP:8080` erreichbar.

## Variante B: Mit Domain und HTTPS

Wenn du eine Domain hast, kannst du statt des Standard-Compose-Files die Produktionsvariante nutzen.

### 1. `.env` anpassen

```bash
sudo nano .env
```

Setze mindestens:

```bash
DOMAIN=app.deinverein.de
ACME_EMAIL=admin@deinverein.de
JWT_SECRET=ein-langes-zufaelliges-secret
```

Zusätzlich für Push (optional manuell, wird sonst beim Setup automatisch erzeugt):

```bash
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@deinverein.de
```

Beim Start mit `docker-compose.prod.yml` ergänzt `setup-server.sh` fehlende Werte automatisch:
- `DOMAIN` und `ACME_EMAIL` werden im Setup abgefragt (interaktiv, mit Default-Vorschlag)
- `JWT_SECRET` (falls leer/unsicher)
- `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` (falls leer)
- `VAPID_SUBJECT` (falls leer)
- im nicht-interaktiven Setup: `ACME_EMAIL` (falls leer, auf `admin@<DOMAIN>`)

### 2. Produktions-Compose starten

```bash
sudo COMPOSE_FILE=docker-compose.prod.yml bash ./setup-server.sh
```

Danach läuft die App über HTTPS an `https://<DOMAIN>`.

## Updates

Wenn du später Änderungen aus dem Git-Repo übernehmen willst:

```bash
cd /opt/trainello
sudo bash ./update-server.sh
```

Wenn du mehrere Vereins-Instanzen hast (z. B. `/opt/app.deinverein.de`, `/opt/app.verein2.de`) und alle nacheinander updaten möchtest:

```bash
cd /opt/trainello
sudo bash ./update-all-instances.sh
```

Optional nur ein Namensmuster updaten:

```bash
cd /opt/trainello
sudo BASE_DIR=/opt INSTANCE_FILTER='app.*' bash ./update-all-instances.sh
```

Das Update-Skript macht automatisch:

- `.env` sichern
- `git pull` ausführen
- Container neu bauen
- Container neu starten

Die Datenbank und Uploads bleiben erhalten, weil sie in Volumes liegen.

## Wichtige Ports

- `8080`: Frontend bei der Standard-Variante
- `3000`: Backend-API
- `80/443`: nur bei der Produktions-Variante mit Caddy

## Troubleshooting

### Docker-Status prüfen

```bash
docker ps
```

### Logs ansehen

```bash
sudo docker compose --env-file .env -f docker-compose.yml logs -f
```

### Neu starten ohne Update

```bash
sudo docker compose --env-file .env -f docker-compose.yml restart
```

### Komplett stoppen

```bash
sudo docker compose --env-file .env -f docker-compose.yml down
```