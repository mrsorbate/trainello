# trainello

Eine benutzerfreundliche Team-Management-App für Sportvereine mit Fokus auf Terminverwaltung, Zu-/Absagen und Kaderverwaltung.

## Features

- ✅ **Terminverwaltung**: Trainings und Spiele einfach organisieren
- ✅ **Zu-/Absagen System**: Schnelle Rückmeldungen inkl. Trainer-Steuerung pro Spieler
- ✅ **Kaderverwaltung**: Spieler und Trainer verwalten
- ✅ **Statistiken**: Anwesenheitsquoten
- ✅ **Serientermine**: Wiederholungen mit Wochentagen und Enddatum
- 📱 **Progressive Web App**: Auf allen Geräten nutzbar
- 🔒 **Sicher**: Moderne Authentifizierung und Datenschutz

### Aktueller Produktstand (März 2026)

- Serientermine können beim Erstellen per **Ja/Nein** aktiviert werden, danach werden Wochentage und „bis wann“ gewählt.
- Beim Bearbeiten von Serienterminen ist der Scope auswählbar: **nur dieser Termin** oder **ganze Serie**.
- Wird ein Serientermin einzeln bearbeitet, wird er aus der Serie gelöst (eigenständiger Termin).
- Die Serieninformation wird in der normalen Termin-Detailansicht nicht mehr angezeigt, sondern nur im Bearbeitungsfluss.
- Trainer sehen in der Termin-Detailansicht den hinterlegten Absagegrund von Spielern.
- Spieler müssen bei eigener Absage einen Grund angeben; Trainer können Status für sich und Spieler ohne Pflichtgrund setzen.

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite (Build Tool)
- Tailwind CSS (Styling)
- React Router (Navigation)
- React Query (Data Fetching)
- PWA Support

### Backend
- Node.js + Express + TypeScript
- SQLite / PostgreSQL
- JWT Authentication
- REST API

## Projekt-Struktur

```
.
├── frontend/          # React Frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/           # Node.js Backend
│   ├── src/
│   └── package.json
└── README.md
```

## Installation

### Server / Linux VM

Für einen blanken Linux-Server findest du eine konkrete Schritt-für-Schritt-Anleitung in [SERVER-SETUP.md](SERVER-SETUP.md).

Kurzfassung:
- Repository klonen
- Docker + Docker Compose installieren
- `bash ./setup-server.sh` ausführen
- Für spätere Änderungen `bash ./update-server.sh` ausführen
- Für mehrere Vereins-Instanzen nacheinander: `bash ./update-all-instances.sh`

---

### Backend (lokal entwickeln)
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Entwicklung

Die App läuft standardmäßig auf:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

### Toast-Guideline (UI-Feedback)

Für konsistente Nutzer-Rückmeldungen im Frontend:

- `success`: Aktion erfolgreich abgeschlossen (z. B. erstellt, gespeichert, gelöscht)
- `info`: Neutraler Hinweis ohne Handlungsdruck
- `warning`: Benutzer kann selbst nachbessern (z. B. Dateityp/-größe)
- `error`: Technischer oder serverseitiger Fehler

Technische Basis:
- Globaler Provider: `frontend/src/lib/useToast.tsx`
- Anzeige-Komponente: `frontend/src/components/ToastMessage.tsx`
- Nutzung in Seiten: `const { showToast } = useToast()`

## Docker

Die App kann komplett per Docker gestartet werden (Frontend + Backend).

### Umgebungsvariablen
```bash
cp .env.example .env
```

Danach ggf. `JWT_SECRET`, `FRONTEND_PORT` und `BACKEND_PORT` in `.env` anpassen.

Für öffentliche Deployments (Domain/Reverse Proxy) zusätzlich `FRONTEND_URL` setzen,
z. B. `https://app.meinverein.de`, damit Einladungslinks immer die richtige URL enthalten.

Hinweis: Eine Root-Vorlage liegt in [.env.example](.env.example). Für Produktion mit `docker-compose.prod.yml` ergänzt das Setup fehlende Pflichtwerte automatisch:
- `DOMAIN` und `ACME_EMAIL` werden im interaktiven Setup abgefragt (mit Default-Vorschlag).
- `JWT_SECRET` wird erzeugt, wenn leer oder unsicher.
- `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` werden erzeugt, wenn leer.
- `VAPID_SUBJECT` wird auf `mailto:<ACME_EMAIL>` gesetzt, wenn leer.
- Im nicht-interaktiven Setup wird `ACME_EMAIL` bei leerem Wert auf `admin@<DOMAIN>` gesetzt.

### Starten
```bash
docker compose up --build
```

Danach läuft die App auf:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000

### Stoppen
```bash
docker compose down
```

### Mit Daten-Reset
```bash
docker compose down -v
```

Es werden zwei persistente Volumes verwendet:
- `backend_data` für SQLite-Datenbank
- `backend_uploads` für hochgeladene Bilder

### Docker + SSL (Produktion)

Für HTTPS mit automatischen Let's Encrypt Zertifikaten ist ein separater Stack enthalten.

Voraussetzungen:
- Domain zeigt per DNS auf den Server
- Ports `80` und `443` sind erreichbar

In `.env` setzen:
- `DOMAIN=app.svhochweisel.de` (oder eine andere Vereins-Domain/Subdomain)
- `ACME_EMAIL=admin@svhochweisel.de`
- `JWT_SECRET=<starkes-secret>`
- `VAPID_PUBLIC_KEY=<public-key>` (optional, wird bei leerem Wert automatisch erstellt)
- `VAPID_PRIVATE_KEY=<private-key>` (optional, wird bei leerem Wert automatisch erstellt)
- `VAPID_SUBJECT=mailto:admin@svhochweisel.de` (optional, wird bei leerem Wert automatisch gesetzt)

Start:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Danach läuft die App unter:
- `https://<DOMAIN>`

Hinweise:
- `FRONTEND_URL` und `CORS_ORIGIN` werden im Prod-Stack automatisch auf `https://<DOMAIN>` gesetzt.
- Invite-Links werden damit ebenfalls korrekt als HTTPS-Domain erzeugt.
- Backend nutzt Security-Header (`helmet`) und Rate-Limits für API/Auth.

Optionale Feineinstellungen in `.env`:
- `JWT_EXPIRES_IN` (aktuell `1h` zum Testen, z. B. `7d`, `30d`, `12h`)
- `API_RATE_LIMIT_WINDOW_MS` (Standard `900000` = 15 Min)
- `API_RATE_LIMIT_MAX` (Standard `300` Requests/Window)
- `AUTH_RATE_LIMIT_MAX` (Standard `20` Requests/Window)
- `LOGIN_RATE_LIMIT_WINDOW_MS` (Standard `900000` = 15 Min)
- `LOGIN_RATE_LIMIT_MAX` (Standard `8` fehlgeschlagene Login-Versuche pro IP+Username)

## Lizenz

MIT
