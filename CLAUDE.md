# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **car dealership kiosk/digital signage application** for "Rotolo Auto". It displays rotating vehicle listings and promotional slides on full-screen displays. No build system or package manager — it's a single static HTML file with two JSON data sources.

## Running the Application

The new frontend is `index.html` at the repo root (built from `frontend/`). Serve with any static server:

```bash
python -m http.server 8080
```

Then apri `http://localhost:8080/`. Il kiosk carica `./stock.json` e `./settings.json` dallo stesso origine.

`slideshow.html` è il vecchio frontend (mantenuto per riferimento).

## Configuration

**`settings.json`** — controls slideshow behavior:
- `durata_slide`: seconds per slide
- `max_annunci`: max vehicle listings to display
- `ordine`: slide order (`"Casuale"` = random)
- `promo`: array of paths to promotional image files

**`stock.json`** — vehicle inventory array. Each item: `titolo`, `prezzo`, `anno`, `km`, `alimentazione`, `cambio`, `link`, `immagine`, `posizione`. Updated by the CMS scraper.

## Frontend Architecture (`frontend/`)

React + Vite app. Build con `cd frontend && npm run build` (output va nella root del repo).

- `frontend/src/Showroom.jsx` — componente principale kiosk: `useSlideshow` hook (due interval: avanzamento slide + progress bar), `fetchWithRetry` per resilienza al boot, `useMemo` per `slides` e `promo`
- `frontend/src/App.jsx` — wrapper minimale, renderizza solo `<Showroom />`
- `frontend/vite.config.js` — `base: './'`, `outDir: '..'`, `emptyOutDir: false` (critico: non cancella stock.json)

**Slide types:**
- *Annuncio*: immagine (S3) a sinistra 58%, info destra 42% (titolo, tag Anno/KM/Carburante/Cambio, prezzo gold, QR code)
- *Promo*: immagine full-area, `object-fit: contain`

**Slideshow controller** — `setInterval` con cleanup su ogni cambio slide; progress bar aggiornata ogni 50ms; retry automatico fino a 5 volte su errore fetch al boot.

## Asset Paths

- Background: `static/backgrounds/background-auto-persone.png`
- Promos: `static/promos/` (paths referenced in `settings.json`)
- Car images: external URLs from `rotoloautomobili.com` (S3 bucket: `mulitpubblicatorebucket.s3.eu-central-1.amazonaws.com`)
- QR codes: generated via `api.qrserver.com` using each vehicle's `link`

---

## NEWSECTION — Streamlit CMS

`NEWSECTION/app.py` is a Streamlit admin dashboard for managing the slideshow content. Run with:

```bash
cd NEWSECTION
python -m streamlit run app.py
# or double-click avvia_cms.bat
```

**Tabs:**
1. **Dashboard** — paginated list of current listings with thumbnails
2. **Scraping** — triggers the web scraper to pull listings from the dealer website
3. **Editor** — inline editing of each listing (title, price, year, km, position); auto-resolves duplicate positions
4. **Settings** — controls `durata_slide`, `max_annunci`, `ordine` for the slideshow
5. **GitHub** — pushes `stock.json` and `settings.json` to the repo (credentials in `secrets.json`)

**Scraper target** (current): `www.rotoloautomobili.com` — three sections:
- `/lista-veicoli/km0/` — new cars (pagination: `?Page=N&NumeroVeicoli=4`)
- `/lista-veicoli/usato/` — used cars (pagination: `?Page=N&NumeroVeicoli=100&ListaFiltri[0].Value=USATO`)
- `/outlet/` — clearance (pagination: `?Page=N&NumeroVeicoli=10`)

**HTML structure reale** (verificata 26/02/2026): cards sono `<a class="item" href="/auto/...">` con figli `div.section1` (titolo/variante), `div.section2` (km/alimentazione/cambio), `div.section3` (prezzo), `div.image` (foto S3). Selettori class-based, non regex.

**Bug noti sito:** sezione `usato` a volte ritorna pagine vuote nel live (da investigare) — le fixture scaricate avevano 12 annunci ma lo scraping live trova 0. Probabile causa: diversa struttura HTML in prod o parametri URL che cambiano.

`script.py` è il vecchio scraper (sito precedente, conservato come riferimento).

---

## newfrontend — Design Inspiration

`newfrontend/` is a React + Vite app (run with `npm install && npm run dev`) with a bold retro-neon aesthetic: gold (#FFD700), magenta (#FF00FF), cyan (#00FFFF), black. Heavy borders, offset shadows, rotated elements.

**Key component for the kiosk: `newfrontend/src/Showroom.jsx`** — already implements a full-screen rotating display: auto-cycles cars every 5s, progress bar animation, contact info bar at bottom. This is the primary visual reference for the new frontend.

Components to adapt: `Showroom.jsx` (essential), `CarCard.jsx` (design reference).
Components to ignore: `ContactForm.jsx`, `Navbar.jsx`, `Hero.jsx`, `CarDetailModal.jsx`, `PdfGenerator.jsx`.

---

## Workflow aggiornamento listino

1. `cd NEWSECTION && python -m streamlit run app.py` — apri il CMS
2. Tab **Scraping** → avvia scraping (km0 + outlet; usato da investigare — vedi bug noti)
3. Tab **GitHub** → push `stock.json` e `settings.json` sul repo
4. Il frontend React su GitHub Pages ricarica il listino al prossimo ciclo di slide

Per aggiornare il frontend (solo quando cambia il design):
```bash
cd frontend && npm run build
git add ../index.html ../assets/
git commit -m "feat: aggiornamento frontend"
git push
```

URL GitHub Pages: `https://williamsrotolo.github.io/autocaricamento/`

---

## Feature future pianificate

- **Fix scraper usato** — investigare perché la sezione usato live restituisce 0 annunci (fixture ok, live broken)
- **Gestione promo dal CMS** — aggiungere upload/rimozione immagini promo direttamente nel tab Settings di Streamlit, con push via GitHub API (invece di gestirle a mano nella cartella git)
- **Vista Masonry 6×6** — tab alternativa alla vetrina rotante che mostra 36 annunci in griglia simultaneamente (da aggiungere al frontend o al CMS)
- **Verifica nomi veicolo** — controllare che `titolo` estratto (marca+modello+variante) sia corretto e leggibile per tutti i modelli
