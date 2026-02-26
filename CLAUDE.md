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
- Car images: external URLs from `rotoloauto.com`
- QR codes: generated via `api.qrserver.com` using each vehicle's `link`
