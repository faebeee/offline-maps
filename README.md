# Offline Maps

Self-hosted vector map tiles with a browser viewer. Download a region once, then
pan and zoom with no internet connection.

```
npm install
npm run dev
```

Open <http://localhost:5173> and add a region from the UI — setup, search,
download and delete all happen in the browser.

---

## How it works

Regions are extracted out of the global [Protomaps](https://protomaps.com) planet
build using HTTP range requests, so adding a city downloads only that city's
tiles — not the 130 GB planet file. Each region lands in `data/regions/<name>.pmtiles`.

The backend serves tiles, a MapLibre style, glyphs and sprites, all from
localhost. Nothing is fetched from a CDN at runtime, which is what makes the
viewer work with the network unplugged.

```
bin/pmtiles                 go-pmtiles CLI (installed on first run)
data/regions/*.pmtiles      one archive per region
data/regions.json           registry: bbox, zoom range, build date, size
data/geofabrik-index.json   catalog of 554 named regions
assets/fonts, assets/sprites  vendored map assets
apps/backend/               NestJS server + region CLI
apps/frontend/              Vite + React + MapLibre viewer
packages/shared/            types shared by server and viewer
```

The repo is an npm workspaces monorepo: `apps/*` are deployables, `packages/*`
are libraries consumed by them. `@offline-maps/shared` holds the `/api` contract
(`Region`, `Theme`, response shapes), so a registry change fails the typecheck on
both sides.

```sh
npm run build        # shared -> backend -> frontend
npm run typecheck    # every workspace
```

### Backend

A NestJS app on the Express adapter, compiled with `tsc` to `apps/backend/dist`
(decorator metadata rules out esbuild-based runners). Modules mirror the routes:

```
src/regions/    registry + open PMTiles handles; /api/regions, /tiles, /pmtiles
src/styles/     MapLibre style assembly; /api/styles
src/assets/     vendored glyphs and sprites; /fonts, /sprites
src/spa/        catch-all serving the built viewer (imported last, so it
                never shadows an API route)
src/places/     name -> boundary lookup; /api/places
src/jobs/       job registry + SSE stream; /api/jobs
src/downloads/  the add-a-region pipeline; /api/downloads
src/setup/      first-run bootstrap; /api/status, /api/setup
src/tools/      go-pmtiles binary wrapper
src/cli/        headless `setup` and `assets:fetch`, through
                NestFactory.createApplicationContext
```

Regions are managed from the UI, so the CLI only covers headless bootstrap
(`npm run setup`). It shares the server's providers rather than duplicating
them.

## Adding regions

Press **+** in the sidebar and search for a city, state or country. Names
resolve against the Geofabrik catalog first (exact administrative borders, 554
entries); anything it doesn't cover falls back to OpenStreetMap's Nominatim, so
ambiguous names come back as a list to pick from:

```
Austin   Travis County, Texas, United States · 0.38° × 0.42°
Austin   Mower County, Minnesota · 0.13° × 0.07°
```

Selecting one outlines it on the map. Pick a detail level, and the exact cost is
measured with a real `pmtiles extract --dry-run` before anything downloads:

```
Archive        To download     Planet build
741 MB         779 MB          20261026
```

Confirm and the extract runs with live progress; cancelling at any point kills
it and removes the partial archive. Rough sizes at the default zoom 15: a city
like Berlin is ~65 MB, a country like Switzerland ~750 MB. Each level down
roughly halves that.

Deleting is the **×** on a region row, with an inline confirm.

Only one download runs at a time — a second request gets a `409`. Jobs live in
memory, so restarting the server drops them; any half-written archive is swept
on the next boot.

## Running

```sh
npm run dev                 # backend :8080 + Vite :5173, both reloading
npm run build && npm start  # single server on :8080
```

Backend dev runs `tsc --watch` next to `node --watch dist/main.js`, so a saved
`.ts` file restarts the server.

### Docker

```sh
docker compose up -d --build   # production server on :8080
```

The image ships its own Linux `pmtiles` binary; `data/` and `assets/` are
bind-mounted, so regions and fonts survive rebuilds and are shared with a local
checkout. On a fresh clone, run setup from the viewer, or through the CLI:

```sh
docker compose run --rm offline-maps node apps/backend/dist/cli/main.js setup
```

`/api` only answers `http://localhost:8080` and `http://127.0.0.1:8080`. When
publishing on another port (`PORT=9000 docker compose up`) or hostname, list the
viewer's origin in `ALLOWED_ORIGINS`, comma-separated. On Linux, create `data/`
and `assets/` before the first start so they are owned by your user (uid 1000)
rather than root.

## API

| Route | Purpose |
|---|---|
| `GET /api/regions` | Registry of downloaded regions |
| `GET /api/styles/:region.json` | MapLibre style. `?theme=light\|dark\|white\|grayscale\|black` |
| `GET /tiles/:region/:z/:x/:y.mvt` | Vector tile |
| `GET /pmtiles/:region.pmtiles` | Raw archive, with HTTP range support |
| `GET /fonts/:fontstack/:range.pbf` | Glyphs |
| `GET /sprites/*` | Sprite sheets |

Region management:

| Route | Purpose |
|---|---|
| `GET /api/status` | What first-run setup still has to do |
| `POST /api/setup` | Install the pmtiles binary, vendor fonts and sprites |
| `GET /api/places?q=` | Candidate boundaries for a place name |
| `POST /api/downloads` | Start a download; parks on an estimate |
| `POST /api/downloads/:id/confirm` | Accept the estimate, run the extract |
| `GET /api/jobs`, `GET /api/jobs/:id` | Job state |
| `GET /api/jobs/:id/events` | Server-sent progress stream |
| `DELETE /api/jobs/:id` | Cancel a job, or decline an estimate |
| `DELETE /api/regions/:name` | Delete an archive and its registry entry |

Map data (`/tiles`, `/pmtiles`, `/fonts`, `/sprites`) is readable from any
origin so QGIS and the pmtiles CLI keep working. `/api` is not: it answers only
the origin that served the viewer, and mutating requests are additionally
rejected when `Sec-Fetch-Site` says cross-site — otherwise any page you visit
could start a 50 GB download on your disk. Set `ALLOWED_ORIGINS` (comma
separated) if you front it with something unusual.

Tiles are stored gzipped and stream through uncompressed-on-demand: clients that
send `Accept-Encoding: gzip` get the stored bytes untouched, others get them
decompressed.

The `/pmtiles/` route serves proper `206 Partial Content` responses, so the
archive can be opened directly by other tools over HTTP:

```sh
pmtiles show http://localhost:8080/pmtiles/berlin.pmtiles
```

QGIS can add the same URL as a vector tile layer.

## Offline guarantees

Internet is needed exactly twice: the one-time setup, and each region download.
Everything the viewer loads afterwards — tiles, style, glyphs, sprites, the app
bundle and MapLibre's web worker — is served from localhost.

To verify, disconnect from the network and reload the page. The map must render
fully. A CDN dependency sneaking into the style is the usual way this breaks.

## Attribution

Map data © [OpenStreetMap](https://openstreetmap.org/copyright) contributors,
tiles by [Protomaps](https://protomaps.com), styles from
[@protomaps/basemaps](https://github.com/protomaps/basemaps), fonts and sprites
from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets)
(fonts under the SIL Open Font License).
