# Demo-Ticker

Demo-Ticker archiviert die offiziellen Berliner Daten zu angemeldeten Versammlungen und Aufzügen in PostgreSQL. Dieses Repository enthält die lauffähigen Kerne von **Phase 1 und Phase 2** des Projektplans: Datenimport, REST-Suche und ein schlankes React-Frontend.

## Voraussetzungen installieren

Auf einem frischen Windows-Rechner (10/11) ist nichts vorinstalliert. Es werden nur drei Programme gebraucht; PostgreSQL läuft ausschließlich im Docker-Container und wird nicht separat installiert.

1. **Git** (zum Herunterladen des Projekts): <https://git-scm.com/download/win>
2. **Node.js 20 oder neuer** (LTS-Version): <https://nodejs.org/>
3. **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>

Hinweise zu Docker Desktop:

- Es nutzt WSL 2. Der Installer richtet das bei Bedarf ein, danach ist ein **Neustart** nötig.
- Docker Desktop nach der Installation einmal starten und warten, bis unten links „Engine running“ steht. Ohne laufendes Docker Desktop schlägt `docker compose` fehl.
- In der Regel muss in der BIOS/UEFI-Einstellung die Virtualisierung (Intel VT-x / AMD-V) aktiv sein.

Nach der Installation ein **neues** Terminal (PowerShell) öffnen, damit die Programme im PATH gefunden werden, und prüfen:

```powershell
git --version
node --version
docker --version
docker compose version
```

Alle vier Befehle müssen eine Version ausgeben. `node --version` muss mindestens `v20` zeigen.

## Lokal starten

```powershell
git clone <Repository-URL> demo-ticker
cd demo-ticker
npm install
Copy-Item .env.example .env
docker compose up -d postgres
npm run db:migrate
npm test
npm run dev
```

Unter macOS/Linux statt `Copy-Item`: `cp .env.example .env`. Die einzelnen Schritte zur Datenbank erklärt der nächste Abschnitt.

Für einen Test ohne Netzwerk kann eine gespeicherte API-Antwort importiert werden:

```powershell
$env:IMPORT_FILE='./data/all.json'; npm run import
```

(macOS/Linux: `IMPORT_FILE=./data/all.json npm run import`)

Für den Live-Abruf muss `ASSEMBLIES_API_URL` in `.env` auf den offiziellen `all.json`-Endpunkt der Polizei Berlin gesetzt werden:

```powershell
$env:ASSEMBLIES_API_URL='https://www.berlin.de/polizei/.../versammlungen-aufzuege/index.php/index/all.json'; npm run import
```

(macOS/Linux: `ASSEMBLIES_API_URL='…' npm run import`)

Der Import ist transaktional. Jeder Datensatz erhält einen stabilen SHA-256-Schlüssel aus Datum, Beginn, Thema und Ortsangaben. Änderungen werden in `assembly_history` als JSON-Diff archiviert; alte Einträge bleiben erhalten.

## Automatischer Import

Der Import läuft ohne Zutun regelmäßig, solange dieser Prozess läuft:

```powershell
npm run import:schedule
```

Er ruft die Quelle sofort und danach alle `IMPORT_INTERVAL_MINUTES` Minuten ab (Standard 60, einstellbar in `.env`) und protokolliert jeden Lauf auf der Konsole. Ein fehlgeschlagener Lauf stoppt den Zeitplan nicht, der nächste Lauf startet planmäßig. Beenden mit `Strg+C`. Ein einzelner Lauf ohne Zeitplan: `npm run import` (nur Abruf) oder `npm run update` (mit Ortsbestimmung).

Jeder Lauf wird in der Tabelle `import_runs` festgehalten (Status, Anzahl neu/geändert/unverändert/entfernt, Fehlermeldung). Der letzte Stand ist über `GET /api/import/status` abrufbar.

Das Archiv schützt sich selbst:

- **Entfernte Einträge:** Eine kommende Versammlung, die die Quelle nicht mehr listet, wird nicht gelöscht, sondern mit `removed_at` markiert und in der Historie vermerkt. Taucht sie wieder auf, wird die Markierung zurückgenommen. Vergangene Versammlungen, die aus der Quelle verschwinden, bleiben unverändert.
- **Plausibilitätsprüfung:** Liefert die Quelle keine Einträge oder weniger als die Hälfte des letzten erfolgreichen Laufs, wird der Import abgebrochen, ohne Daten zu ändern. So führt eine defekte Antwort nicht dazu, dass alle Einträge als entfernt gelten.
- **Zeitüberschreitung:** Der Abruf bricht nach 60 Sekunden ab (`IMPORT_TIMEOUT_MS`).

Soll der Import unabhängig von einem offenen Terminal laufen, gibt es drei Wege:

- **Windows-Aufgabe:** Das Skript `scripts/install-import-task.ps1` legt eine Aufgabe „Demo-Ticker Import“ an, die `npm run update` (Import und Ortsbestimmung) stündlich startet und nach `logs/import.log` schreibt. Die Aufgabe läuft unter deinem Benutzer, solange du angemeldet bist, und braucht einen laufenden Datenbank-Container (Docker Desktop):

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\install-import-task.ps1
  ```

  Anderes Intervall: `-IntervalMinutes 30`. Sofort ausführen: `Start-ScheduledTask -TaskName 'Demo-Ticker Import'`. Entfernen: `... -Remove`.
- **Docker:** Der Dienst `importer` im Compose-Profil `app` läuft rund um die Uhr (siehe „Betrieb im Internet“).
- **cron** (Linux/macOS): `0 * * * * cd /pfad/zu/demo-ticker && npm run import`

## Gestaltung

Die Oberfläche folgt dem Designsystem „Modern Vintage Minimalism“ (warme Cremetöne, Braun, gedämpftes Olive, vereinzelt Terrakotta). Alle Werte stehen als Tokens am Anfang von `src/frontend/styles.css` (`--background`, `--surface`, `--primary`, `--space-*`, `--radius-*` …); neue Komponenten werden daraus gebaut, nicht mit neuen Farben.

- **Layout:** feste Sidebar (240 px), Header (64 px) und Inhalt (maximal 1160 px). Ab 768 px ist die Sidebar eine Icon-Leiste (72 px) mit Tooltips, unter 768 px ein Drawer (Fokusfalle, Escape, Klick daneben, Fokus kehrt zum Menü-Button zurück). Die Navigation steht einmal in `src/shared/nav.js` und gilt für die App und die serverseitigen Seiten (Impressum, Datenschutz, 404).
- **Schrift:** DM Sans, **selbst gehostet** (`src/frontend/fonts/`, Lizenz SIL OFL 1.1 liegt dabei). Ein Einbinden über Google Fonts hätte die IP jedes Besuchers an Google übertragen und der Datenschutzerklärung und der Content-Security-Policy widersprochen.
- **Icons:** Lucide (`lucide-react` im Browser, `lucide` für die serverseitigen Seiten), Strichstärke 1,75.
- **Dark Mode:** Er bestand schon vorher (automatisch nach Systemeinstellung) und bleibt unverändert in seiner Funktion. Er mappt nur die Tokens neu; die neue Gestaltung ist für die helle Darstellung spezifiziert.
- **Barrierefreiheit:** sichtbare Fokusringe, Skip-Link, Beschriftungen, Drawer als Dialog, Skeleton-Ladezustände, `prefers-reduced-motion`. Die Kontraste aller Text- und Farbpaare sind nachgerechnet (WCAG AA).

## Karte und Ortsbestimmung

Die Ansicht „Karte“ zeigt die Versammlungen des aktuellen Filters auf einer Berlin-Karte (Markierungen, Cluster mit Anzahl, Zoom per Buttons, Mausrad und Ziehen, Tastaturbedienung). Die Karte ist selbst als SVG gezeichnet: Die Bezirksgrenzen liegen als kleine Datei im Frontend (`src/frontend/berlin-map.js`, 17 KB), es werden **keine Kartenkacheln und keine Dienste Dritter** aus dem Browser geladen. Die Listenansicht bleibt die vollständige Alternative.

Die Quelle liefert keine Koordinaten. Der **Server** ermittelt sie aus Straße, Hausnummer und PLZ über den Geocoder Nominatim (OpenStreetMap). Übermittelt werden nur die öffentlich bekannten Adressen, keine Daten von Besucherinnen und Besuchern. Das passiert automatisch nach jedem Import für neue Einträge (höchstens `GEOCODE_BATCH`, Standard 100, pro Lauf; eine Anfrage pro Sekunde, wie es die Nutzungsregeln verlangen). Das Ergebnis wird gespeichert, jede Adresse wird also nur einmal angefragt.

```powershell
npm run update      # Import und anschließend Ortsbestimmung für neue Einträge
npm run geocode     # nur Ortsbestimmung, alle offenen Einträge (beim ersten Mal rund 30 Minuten)
```

- Der Befehl `npm run geocode` meldet `"checked":0`, wenn nichts mehr offen ist; das ist kein Fehler. Fehlgeschlagene Einträge werden erst nach `GEOCODER_RETRY_DAYS` erneut versucht, sofort geht es mit `GEOCODER_RETRY_DAYS=0` (PowerShell: `$env:GEOCODER_RETRY_DAYS='0'; npm run geocode`).
- Ergebnisse außerhalb von Berlin werden verworfen (gleichnamige Straßen in anderen Städten). Einträge ohne Straße und ohne Strecke oder ohne Treffer erscheinen nicht auf der Karte; die Seite nennt, wie viele es sind. Bahnhöfe („S-Bhf. Zehlendorf“) werden als „Bahnhof …“ gesucht, Zusätze wie „ggü“ abgeschnitten. Bei **Aufzügen ohne Adresse** wird der Startpunkt der Strecke verwendet, die Markierung zeigt dann die Straße ohne Hausnummer. Nicht gefundene Einträge werden nach `GEOCODER_RETRY_DAYS` (7) erneut versucht.
- Abschalten: `GEOCODING=off` in `.env`. Eigener Geocoder: `GEOCODER_URL`. Kontaktangabe für den User-Agent (die Nominatim-Regeln empfehlen sie): `GEOCODER_CONTACT` in `.env`; sie wird nur gesendet, wenn du sie selbst einträgst.
- Namensnennung: Die Seite nennt unter der Karte und im Impressum „© OpenStreetMap-Mitwirkende (ODbL)“ sowie die Herkunft der Bezirksgrenzen. Die Bezirksgrenzen stammen aus dem Datensatz „ALKIS Berlin Bezirke“ des Geoportals Berlin, veröffentlicht unter der Datenlizenz Deutschland – Zero – Version 2.0 (keine Namensnennungspflicht, die Angabe erfolgt freiwillig).
- Die Grenzen lassen sich neu erzeugen: `node scripts/build-berlin-map.mjs [GeoJSON-Datei oder URL]`.

## Datenbank einrichten

Demo-Ticker nutzt PostgreSQL 16, das per Docker bereitgestellt wird (`docker-compose.yml`). Die Verbindung wird ausschließlich über `DATABASE_URL` in `.env` konfiguriert. XAMPP/MariaDB ist kein Ersatz.

### 1. Konfiguration anlegen

```powershell
Copy-Item .env.example .env
```

Die Standardwerte passen zur `docker-compose.yml`, es muss nichts geändert werden:

```text
DATABASE_URL=postgres://demo_ticker:demo_ticker@localhost:5432/demo_ticker
```

#### Neue Einstellungen aus `.env.example` übernehmen

Kommen mit einem Update neue Variablen in `.env.example` dazu, trägt dieser Befehl sie in alle vorhandenen Env-Dateien (`.env`, `.env.local`, `.env.production` …) nach:

```powershell
npm run env:sync -- --dry-run    # zeigt nur, was ergänzt würde
npm run env:sync                 # ergänzt es
npm run env:sync -- .env.production   # nur bestimmte Dateien
```

Vorhandene Werte werden nie geändert. Neue Variablen landen am Ende der Datei in einem Block „aus .env.example übernommen“, samt ihren Erklärungen; was im Beispiel auskommentiert ist, bleibt auch in der Zieldatei auskommentiert und ist damit wirkungslos, bis du es aktivierst. Eine Variable, die in der Datei schon vorkommt, auch auskommentiert, wird nicht erneut angeboten. Ein zweiter Lauf ändert nichts mehr.

### 2. PostgreSQL starten

Docker Desktop muss laufen (siehe oben).

```powershell
docker compose up -d postgres
```

Beim ersten Start lädt Docker das Image `postgres:16-alpine` herunter (einige hundert MB, dauert etwas). Der Container legt Datenbank, Benutzer und Passwort (jeweils `demo_ticker`) selbst an und speichert die Daten im Volume `postgres-data`. Ob er bereit ist, zeigt `docker compose ps` (Status `healthy`).

### 3. Schema anlegen

```powershell
npm run db:migrate
```

Das Skript führt alle Dateien `db/NNN_*.sql` in Reihenfolge aus und legt die Tabellen `assemblies`, `assembly_history` und `import_runs` samt Indizes an. Alle Statements sind `IF NOT EXISTS`, der Befehl kann daher beliebig oft wiederholt werden. Bei Erfolg erscheint `Database schema is up to date.`

### 4. Prüfen

```powershell
docker compose exec postgres psql -U demo_ticker -d demo_ticker -c "\dt"
```

Die Ausgabe muss beide Tabellen enthalten. Anschließend füllt `npm run import` die Datenbank (siehe oben).

### Stoppen und Zurücksetzen

- `docker compose stop` hält die Datenbank an, die Daten bleiben erhalten. `docker compose up -d postgres` startet sie wieder.
- `docker compose down -v` löscht Container und Volume und damit **alle Daten**. Danach Schritt 2 und 3 wiederholen.

### Häufige Fehler

- `docker` wird nicht gefunden: Docker Desktop ist nicht installiert oder das Terminal wurde nach der Installation nicht neu geöffnet.
- `error during connect` / `cannot connect to the Docker daemon`: Docker Desktop ist nicht gestartet.
- `DATABASE_URL is required`: `.env` fehlt (Schritt 1).
- `ECONNREFUSED`: Der Container läuft noch nicht (`docker compose ps`).
- `Passwort-Authentifizierung für Benutzer „demo_ticker“ fehlgeschlagen` (`password authentication failed`) obwohl der Container läuft: Auf Port 5432 lauscht bereits eine andere, lokal installierte PostgreSQL-Instanz und fängt die Verbindung ab. Ohne diese zu beenden, in `.env` einen anderen Host-Port setzen, die Datenbank neu starten und `DATABASE_URL` anpassen:

  ```text
  POSTGRES_PORT=5433
  DATABASE_URL=postgres://demo_ticker:demo_ticker@localhost:5433/demo_ticker
  ```

  ```powershell
  docker compose up -d postgres
  ```

## API und Suche

Die Produktionsausgabe wird mit `npm run build` nach `dist/` geschrieben. Der Node-Server startet sie zusammen mit der REST-API:

```sh
npm run build
npm start
```

- `GET /api/assemblies` – paginierte Suche mit `q`, `dateFrom`, `dateTo`, `plz`, `street`, `page` und `pageSize`
- `GET /api/assemblies/:id` – Detaildaten inklusive Änderungshistorie
- `GET /api/map` – kompakte Punkte für die Karte (gleiche Filter wie die Suche, höchstens 2000) samt Anzahl verorteter und nicht verorteter Treffer
- `GET /api/import/status` – Ergebnis des letzten Importlaufs und Zeitpunkt des letzten Erfolgs
- `GET /feed.xml` – Atom-Feed für heute und die nächsten 14 Tage (absolute Links aus `PUBLIC_URL`, sonst aus dem Host-Header)

Während der Entwicklung startet `npm run dev` beides zusammen: die API auf Port 3000 und Vite unter `http://localhost:5173`, das `/api` an den Node-Server weiterreicht. Die Seite erreichst du unter `http://localhost:5173`. Voraussetzung ist eine gefüllte Datenbank (`npm run import`) und ein laufender Datenbank-Container. Mit `Strg+C` werden beide Prozesse beendet. Nur das Frontend startet `npm run dev:web`; ohne API bleibt die Seite leer.

## Betrieb im Internet

Für den öffentlichen Betrieb sind drei Dinge nötig: HTTPS, ein ausgefülltes Impressum und die Prüfung der Datenschutzerklärung.

### HTTPS

Die Anwendung liefert HTTPS nicht von sich aus mit, ein Zertifikat muss von einer Zertifizierungsstelle kommen (z. B. kostenlos über Let's Encrypt). Es gibt zwei Wege:

- **Node übernimmt TLS:** `TLS_CERT_FILE` und `TLS_KEY_FILE` in `.env` auf die Zertifikatsdateien setzen, dann spricht der Server HTTPS.
- **Reverse Proxy** (Caddy, nginx, Apache oder der Hoster) beendet TLS und reicht intern HTTP weiter. Dann `TRUST_PROXY=1` setzen, damit der Header `X-Forwarded-Proto` beachtet wird, und mit `FORCE_HTTPS=1` Aufrufe über HTTP automatisch auf HTTPS umleiten.

Über HTTPS sendet der Server zusätzlich `Strict-Transport-Security`. Unabhängig davon setzt er immer eine strenge Content-Security-Policy (alles nur vom eigenen Server, kein Einbetten in fremde Seiten), `nosniff` und `Referrer-Policy: no-referrer`.

### Login für die ganze Seite

Soll die Seite nur für bestimmte Personen zugänglich sein, genügt ein Schalter in `.env`:

```text
AUTH_ENABLED=1
AUTH_USER=redaktion
AUTH_PASSWORD_HASH=scrypt.16384....
```

Dann verlangt der Server für **alles** ein Passwort: Oberfläche, Dateien, API, Karte und Feed (HTTP-Basic-Authentifizierung, der Browser zeigt sein eigenes Anmeldefenster). Es werden keine Cookies gesetzt, die Aussagen der Datenschutzerklärung bleiben richtig; sie nennt den Login automatisch. Zusätzlich sendet der Server `X-Robots-Tag: noindex`, damit Suchmaschinen die Seite nicht aufnehmen.

- **Passwort-Hash statt Klartext:** `npm run auth:hash -- "mein Passwort"` gibt die Zeile `AUTH_PASSWORD_HASH=...` aus, die du in `.env` einträgst (scrypt mit Salz). Zum Ausprobieren geht auch `AUTH_PASSWORD=...` im Klartext; steht beides in der `.env`, gilt der Hash.
- **Sicher beim Start:** Fehlt Benutzer oder Passwort, startet der Server nicht, statt die Seite versehentlich offen zu lassen.
- **Ausnahmen:** `/healthz` (für den Docker-Healthcheck) ist immer offen und liefert nur `ok`. Impressum und Datenschutz bleiben standardmäßig ohne Login lesbar, weil sie erreichbar sein müssen; mit `AUTH_PROTECT_LEGAL=1` werden auch sie geschützt.
- **Sperre:** Nach `AUTH_MAX_FAILURES` (10) falschen Anmeldungen wird die Adresse für `AUTH_LOCK_MINUTES` (15) mit Status 429 gesperrt. Hinter einem Proxy `TRUST_PROXY=1` setzen, damit die echte Adresse gezählt wird.
- **Wichtig:** Basic-Authentifizierung überträgt das Passwort bei jeder Anfrage, **sie gehört nur zusammen mit HTTPS in den Betrieb** (siehe oben). Der Login gilt für den Node-Server (`npm start`, Docker), nicht für den Vite-Entwicklungsserver auf Port 5173.
- **Feed-Reader und Skripte** melden sich mit `https://benutzer:passwort@host/feed.xml` oder einem Authorization-Header an.

### Nutzerkonten

Für mehrere Personen mit eigenen Zugängen gibt es Nutzerkonten mit Anmeldeformular. Sie lösen den einen gemeinsamen Login oben ab (`AUTH_*` wird dann ignoriert). Einschalten in `.env`:

```text
USERS_ENABLED=1
```

Danach ist die **ganze Seite geschlossen**: Wer nicht angemeldet ist, landet auf `/anmelden`. Offen bleiben nur Impressum, Datenschutz, der Healthcheck und Stylesheet und Schrift dafür.

- **Ersten Admin anlegen** (nach `npm run db:migrate`):

  ```powershell
  npm run user:create -- anna --role admin
  ```

  Der Befehl zeigt ein Startpasswort **einmalig** an. Mit dem Docker-Betrieb: `docker compose --profile app exec app node scripts/users.mjs create anna --role admin`. Weitere Befehle: `npm run user:list`, `npm run user:reset -- anna` (neues Startpasswort, falls jemand ausgesperrt ist).
- **Rollen:** *Admin* sieht zusätzlich den Bereich **Nutzer** (Konten anlegen, Rolle ändern, sperren, Startpasswort setzen, löschen, Protokoll). *Mitglied* nutzt Liste, Karte und Feed.
- **Passwörter:** Startpasswörter vergibt ein Admin (Knopf „Erzeugen“ oder eigener Wert). Das Konto muss es bei der ersten Anmeldung ändern; bis dahin ist nichts anderes erreichbar. Regeln: mindestens 12 Zeichen, nicht den Benutzernamen enthalten, keine trivialen Muster. Gespeichert wird nur ein scrypt-Hash, es gibt keine E-Mail-Adressen und keinen Mailversand.
- **Sitzungen:** Nach der Anmeldung setzt der Server ein Cookie (`HttpOnly`, `SameSite=Lax`, über HTTPS zusätzlich `Secure` und mit `__Host-`-Präfix). In der Datenbank liegt nur ein Hash der Kennung. Sie gelten `SESSION_HOURS` Stunden (Standard 12) und enden sofort beim Abmelden, Sperren, Löschen oder Zurücksetzen des Passworts. Ändert jemand sein eigenes Passwort, enden seine anderen Sitzungen.
- **Schutz vor Missbrauch:** Anfragen von fremden Seiten werden abgelehnt (Prüfung von `Origin` und `Sec-Fetch-Site`). Nach 5 falschen Anmeldungen für denselben Namen und 10 von derselben Adresse gibt es für `AUTH_LOCK_MINUTES` (15) Minuten keinen Zugang mehr. Eine Anmeldung mit unbekanntem Namen verhält sich wie eine mit falschem Passwort. Das eigene Konto kann ein Admin nicht sperren, herabstufen oder löschen, und der **letzte aktive Admin** bleibt immer erhalten.
- **Protokoll:** Anlegen, Rolle, Sperren, Passwort und Löschen werden mit dem handelnden Admin festgehalten (kein Passwort darunter) und nach `AUDIT_RETENTION_DAYS` (365) Tagen gelöscht.
- **Datenschutz:** Die Datenschutzerklärung beschreibt Konten und das Sitzungs-Cookie automatisch. Das Cookie ist für die Anmeldung unbedingt erforderlich und braucht keinen Banner. Wichtig: Wie beim einfachen Login gehört das **nur zusammen mit HTTPS** in den Betrieb.

### Impressum und Datenschutz

Unter `/impressum` und `/datenschutz` liegen serverseitig erzeugte Seiten. Die Angaben zum Betreiber stehen bewusst nicht im Repository, sondern in `.env`:

```text
LEGAL_NAME=Vorname Nachname
LEGAL_STREET=Straße und Hausnummer
LEGAL_CITY=10115 Berlin
LEGAL_EMAIL=kontakt@example.org
LEGAL_PHONE=optional
LEGAL_HOSTING=Hoster und ob Zugriffsprotokolle geführt werden
```

Solange eine der ersten vier Angaben fehlt, zeigen beide Seiten einen deutlichen Warnhinweis. Die Texte beschreiben, was die Anwendung tatsächlich tut (keine Cookies, keine Analyse, keine Drittanbieter, Suchanfragen werden nicht gespeichert). **Sie sind keine Rechtsberatung:** Vor der Veröffentlichung müssen sie geprüft und um die Angaben des Hosters ergänzt werden, insbesondere wenn davor ein Proxy oder Dienst Zugriffsprotokolle führt.

Einen Cookie-Banner gibt es bewusst nicht. Die Seite setzt keine Cookies und nutzt weder Local Storage noch Analyse oder eingebundene Dienste Dritter, eine Einwilligung ist daher nicht erforderlich. Sobald so etwas ergänzt wird, muss das geändert werden.

### Docker-Betrieb auf einem Server

Für den Betrieb ohne Node-Installation gibt es ein `Dockerfile` und im Compose-Profil `app` drei Dienste: `migrate` (legt das Schema an), `app` (Server und Frontend) und `importer` (stündlicher Abruf). Die Datenbank ist derselbe Dienst `postgres` wie in der Entwicklung.

```sh
cp .env.example .env     # LEGAL_*-Angaben und optional PUBLIC_URL eintragen
docker compose --profile app up -d --build
```

Die Seite ist dann unter `http://localhost:3000` erreichbar (anderer Port: `APP_PORT=8080` in `.env`). Der Container läuft nicht als root und hat einen Healthcheck. `docker compose up -d postgres` startet weiterhin nur die Datenbank für die Entwicklung. Aktualisieren: `git pull` und den Befehl oben erneut ausführen; die Daten bleiben im Volume `postgres-data` erhalten.

Für ein öffentliches System sollten die Datenbank-Zugangsdaten in `docker-compose.yml` (Benutzer, Passwort `demo_ticker`) geändert und der Datenbank-Port nicht nach außen veröffentlicht werden. TLS beendet ein vorgeschalteter Proxy (siehe HTTPS oben).

### Auslieferung

Der Server komprimiert Texte (Brotli oder gzip), versieht Dateien mit ETag und liefert die versionierten Dateien in `dist/assets/` ein Jahr lang cachebar aus. Das Frontend lädt nur Dateien vom eigenen Server (rund 83 KB komprimiert, keine Bilder, keine externen Schriften).

## Tests


```powershell
npm test
```

Der Integrationstest `test/users.integration.test.js` startet einen echten Server mit Nutzerkonten und prüft Anmeldung, Pflicht-Passwortwechsel, Rollen, Fremdaufrufe, Sperren, Sitzungsablauf und Protokoll. Die Unit-Tests (Normalisierung, Plausibilitätsprüfung, Suchabfrage, Zeitraum-Schnellfilter, HTTP-Header, rechtliche Seiten) brauchen keine Datenbank. `test/server.test.js` startet den echten Server aus dem Build (`npm run build` vorher ausführen, sonst wird der Test übersprungen) und prüft Header, Kompression, Caching, Adressen und Pfadsicherheit. Der Integrationstest `test/import.integration.test.js` prüft den kompletten Importablauf (Neuanlage, Wiederholung ohne Änderung, Änderungshistorie, Entfernung, Wiederherstellung, Abbruch bei zu kleiner Antwort). Er läuft in einem temporären Schema derselben Datenbank und löscht es danach wieder, vorhandene Daten bleiben unberührt. Ist die Datenbank nicht erreichbar, wird er übersprungen.

## Struktur

- `db/001_initial.sql` – Tabellen `assemblies` und `assembly_history` inklusive Suchindex
- `db/002_import_runs.sql` – Importprotokoll und Markierung entfernter Einträge
- `src/import/normalize.js` – API-Normalisierung, Schlüsselbildung und Regex für Dauerversammlungen
- `src/jobs/import-assemblies.js` – Abruf bzw. Dateiimport, Upsert-Logik, Entfernungserkennung, Laufprotokoll
- `src/jobs/update.js` – Import plus Ortsbestimmung (`npm run update`), `src/jobs/geocode.js` nur Ortsbestimmung
- `src/jobs/scheduler.js` – zeitgesteuerter Lauf von `update` (`npm run import:schedule`)
- `src/geo/geocode.js` – Geocoding mit Nominatim
- `src/frontend/MapView.jsx`, `mapgeo.js`, `berlin-map.js` – Kartenansicht (SVG) und Rechenkern
- `src/frontend/Shell.jsx`, `Icon.jsx`, `history.js` – Rahmen mit Sidebar und Drawer, Icons, lesbare Änderungshistorie
- `src/shared/nav.js`, `src/legal/nav.js`, `src/legal/icons.js` – gemeinsame Navigation, Drawer-Skript und Icons für die serverseitigen Seiten
- `scripts/build-berlin-map.mjs` – erzeugt die vereinfachten Bezirksgrenzen
- `src/import/guard.js` – Plausibilitätsprüfung der Quellantwort
- `src/api/server.js` – REST-API, Routing und Auslieferung des Produktionsbuilds
- `src/api/http.js` – Sicherheits-Header, Kompression, Caching, HTTPS-Umleitung
- `src/api/auth.js`, `scripts/hash-password.mjs` – optionaler gemeinsamer Login für die ganze Seite
- `src/users/` – Nutzerkonten: Regeln (`policy.js`), Datenbank (`store.js`), Fachlogik (`service.js`), HTTP und Seiten (`routes.js`); `scripts/users.mjs` ist der Befehl dazu
- `src/frontend/UsersPage.jsx`, `ui.jsx` – Nutzerverwaltung, Dialog, Menü, Meldungen, Tabs
- `scripts/env-sync.mjs` – überträgt neue Variablen aus `.env.example` in die anderen Env-Dateien
- `src/api/feed.js` – Atom-Feed
- `Dockerfile`, `docker-compose.yml` – Container für Entwicklung (nur Datenbank) und Betrieb (Profil `app`)
- `scripts/install-import-task.ps1` – Windows-Aufgabe für den regelmäßigen Import
- `src/legal/pages.js` – Impressum und Datenschutzerklärung
- `src/frontend/main.jsx` – Such-/Listenansicht und Detailseite
- `docker-compose.yml` – PostgreSQL-Instanz für die lokale Entwicklung

Geheimnisse gehören ausschließlich in `.env`; die Datei ist nicht versioniert.
