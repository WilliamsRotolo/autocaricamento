# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **car dealership kiosk/digital signage application** for "Rotolo Auto". It displays rotating vehicle listings and promotional slides on full-screen displays. No build system or package manager — it's a single static HTML file with two JSON data sources.

## Running the Application

Open `slideshow.html` directly in a browser. The app uses `fetch()` to load `stock.json` and `settings.json` from the same directory, so it must be served over HTTP (not `file://`). Use any static server:

```bash
python -m http.server 8080
# or
npx serve .
```

## Configuration

**`settings.json`** — controls slideshow behavior:
- `durata_slide`: seconds per slide
- `max_annunci`: max vehicle listings to display
- `ordine`: slide order (`"Casuale"` = random)
- `promo`: array of paths to promotional image files

**`stock.json`** — vehicle inventory array, each item has: `titolo`, `prezzo`, `anno`, `km`, `link`, `immagine`, `posizione`. Updated regularly by an automated CMS workflow (frequent git commits to these two files).

## Architecture

Everything lives in `slideshow.html`. Key sections:

1. **Data loading** — `Promise.all()` fetches both JSON files concurrently, applies settings, shuffles if random order, then inserts one promo slide every 4 vehicle slides.

2. **Slide types**:
   - *Annuncio* (vehicle): displays car image, title, price, year, km, and a QR code linking to `rotoloauto.com`
   - *Promo*: full-screen promotional image from `static/promos/`

3. **Slideshow controller** — `setInterval` rotates slides at the configured duration; a CSS progress bar (red `#cc0000`) animates in sync with slide timing.

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

HTML structure on all three pages: cards are `<a>` tags, title in `<strong>`, image in last `<img>` with S3 URL, price/year/km as raw text. No CSS classes on cards — use regex patterns to extract fields.

`script.py` is a legacy standalone scraper (older site, kept for reference).

---

## newfrontend — Design Inspiration

`newfrontend/` is a React + Vite app (run with `npm install && npm run dev`) with a bold retro-neon aesthetic: gold (#FFD700), magenta (#FF00FF), cyan (#00FFFF), black. Heavy borders, offset shadows, rotated elements.

**Key component for the kiosk: `newfrontend/src/Showroom.jsx`** — already implements a full-screen rotating display: auto-cycles cars every 5s, progress bar animation, contact info bar at bottom. This is the primary visual reference for the new frontend.

Components to adapt: `Showroom.jsx` (essential), `CarCard.jsx` (design reference).
Components to ignore: `ContactForm.jsx`, `Navbar.jsx`, `Hero.jsx`, `CarDetailModal.jsx`, `PdfGenerator.jsx`.
