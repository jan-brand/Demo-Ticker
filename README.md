# Demo-Ticker

Demo-Ticker archiviert die offiziellen Berliner Daten zu angemeldeten Versammlungen und Aufzügen in PostgreSQL. Dieses Repository enthält die lauffähigen Kerne von **Phase 1 und Phase 2** des Projektplans: Datenimport, REST-Suche und ein schlankes React-Frontend.

## Lokal starten

Voraussetzungen: Node.js 20+ und Docker.

```sh
npm install
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
npm test
npm run dev
```

Für einen Test ohne Netzwerk kann eine gespeicherte API-Antwort importiert werden:

```sh
IMPORT_FILE=./data/all.json npm run import
```

Für den Live-Abruf muss `ASSEMBLIES_API_URL` in `.env` auf den offiziellen `all.json`-Endpunkt der Polizei Berlin gesetzt werden:

```sh
ASSEMBLIES_API_URL='https://www.berlin.de/polizei/.../versammlungen-aufzuege/index.php/index/all.json' npm run import
```

Der Import ist transaktional. Jeder Datensatz erhält einen stabilen SHA-256-Schlüssel aus Datum, Beginn, Thema und Ortsangaben. Änderungen werden in `assembly_history` als JSON-Diff archiviert; alte Einträge bleiben erhalten.

## API und Suche

Die Produktionsausgabe wird mit `npm run build` nach `dist/` geschrieben. Der Node-Server startet sie zusammen mit der REST-API:

```sh
npm run build
npm start
```

- `GET /api/assemblies` – paginierte Suche mit `q`, `dateFrom`, `dateTo`, `plz`, `street`, `page` und `pageSize`
- `GET /api/assemblies/:id` – Detaildaten inklusive Änderungshistorie

Während der Entwicklung liefert Vite das Frontend unter `http://localhost:5173` und proxied `/api` an den Node-Server auf Port 3000.

## Struktur

- `db/001_initial.sql` – Tabellen `assemblies` und `assembly_history` inklusive Suchindex
- `src/import/normalize.js` – API-Normalisierung, Schlüsselbildung und Regex für Dauerversammlungen
- `src/jobs/import-assemblies.js` – Abruf bzw. Dateiimport und Upsert-Logik
- `src/api/server.js` – REST-API und Auslieferung des Produktionsbuilds
- `src/frontend/main.jsx` – Such-/Listenansicht und Detailseite
- `docker-compose.yml` – lokale PostgreSQL-Instanz

Geheimnisse gehören ausschließlich in `.env`; die Datei ist nicht versioniert.
