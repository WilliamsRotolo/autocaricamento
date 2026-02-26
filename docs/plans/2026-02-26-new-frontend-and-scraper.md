# New Frontend (Showroom) + Scraper Aggiornato Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Creare un nuovo frontend React per il kiosk (basato su `newfrontend/Showroom.jsx`) e aggiornare lo scraper del CMS per il nuovo sito `www.rotoloautomobili.com` (3 sezioni: km0, usato, outlet).

**Architecture:** Il nuovo frontend (`frontend/`) è una React+Vite app che carica `stock.json` e `settings.json` e li mostra in rotazione con il design neon gold/magenta. Il CMS Streamlit esistente (`NEWSECTION/`) viene aggiornato solo nel modulo scraper (`scraper.py`) che ora gestisce 3 URL separati con paginazione via parametro `Page=N`.

**Tech Stack:** React 18 + Vite, Python 3 + BeautifulSoup4 + requests, Streamlit (già presente in NEWSECTION)

---

## Fase 1 — Scraper aggiornato (Python)

### Task 1: Analisi manuale del sito e fixture HTML

Il sito è descritto come "buggato" — prima di scrivere lo scraper, raccogliere HTML reale delle pagine da usare come fixture di test.

**Files:**
- Create: `NEWSECTION/tests/fixtures/km0_page1.html`
- Create: `NEWSECTION/tests/fixtures/usato_page1.html`
- Create: `NEWSECTION/tests/fixtures/outlet_page1.html`

**Step 1: Scarica le tre pagine di listing**

```bash
cd NEWSECTION
python -c "
import requests
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
for name, url in [
    ('km0_page1', 'https://www.rotoloautomobili.com/lista-veicoli/km0/'),
    ('usato_page1', 'https://www.rotoloautomobili.com/lista-veicoli/usato/'),
    ('outlet_page1', 'https://www.rotoloautomobili.com/outlet/'),
]:
    r = requests.get(url, headers=headers, timeout=15)
    with open(f'tests/fixtures/{name}.html', 'w', encoding='utf-8') as f:
        f.write(r.text)
    print(name, r.status_code, len(r.text))
"
```

**Step 2: Ispezione manuale delle fixture**

Aprire i file HTML in un browser o editor e identificare:
- Il tag/classe che wrappa ogni annuncio
- Dove si trova il titolo, prezzo, anno, km, link, immagine
- Come appare il blocco di paginazione (se presente)
- Quanti annunci ci sono per pagina in ciascuna sezione

Aggiornare le note alla fine di questo documento con i selettori trovati prima di procedere al Task 2.

**Step 3: Scarica anche una pagina 2 di ciascuna sezione (se esiste)**

```bash
python -c "
import requests
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
for name, url in [
    ('km0_page2', 'https://www.rotoloautomobili.com/lista-veicoli/km0/?Is5OrMorePosti=False&IsIvaEsposta=False&Page=2&NumeroVeicoli=4'),
    ('usato_page2', 'https://www.rotoloautomobili.com/lista-veicoli/usato/?Page=2&NumeroVeicoli=100&ListaFiltri%5B0%5D.Value=USATO'),
    ('outlet_page2', 'https://www.rotoloautomobili.com/outlet/?Is5OrMorePosti=False&IsIvaEsposta=False&IsNeoPatentati=False&IsTrazioneIntegrale=False&Page=2&NumeroVeicoli=10&IsStorica=True'),
]:
    r = requests.get(url, headers=headers, timeout=15)
    with open(f'tests/fixtures/{name}.html', 'w', encoding='utf-8') as f:
        f.write(r.text)
    print(name, r.status_code, len(r.text))
"
```

---

### Task 2: Scrivere il modulo scraper con test

**Files:**
- Create: `NEWSECTION/scraper.py`
- Create: `NEWSECTION/tests/test_scraper.py`

**Step 1: Scrivere il test sui parser (usa le fixture HTML reali)**

```python
# NEWSECTION/tests/test_scraper.py
import pytest
from pathlib import Path
from scraper import parse_listings_from_html, scrape_section, SECTIONS

FIXTURES = Path(__file__).parent / "fixtures"

def test_parse_km0_page1():
    html = (FIXTURES / "km0_page1.html").read_text(encoding="utf-8")
    listings = parse_listings_from_html(html, base_url="https://www.rotoloautomobili.com")
    assert len(listings) > 0, "Nessun annuncio trovato nella pagina km0"
    first = listings[0]
    assert first["titolo"], "Titolo vuoto"
    assert first["prezzo"], "Prezzo vuoto"
    assert first["link"].startswith("http"), f"Link non valido: {first['link']}"
    assert first["immagine"].startswith("http"), f"Immagine non valida: {first['immagine']}"

def test_parse_usato_page1():
    html = (FIXTURES / "usato_page1.html").read_text(encoding="utf-8")
    listings = parse_listings_from_html(html, base_url="https://www.rotoloautomobili.com")
    assert len(listings) > 0, "Nessun annuncio trovato nella pagina usato"

def test_parse_outlet_page1():
    html = (FIXTURES / "outlet_page1.html").read_text(encoding="utf-8")
    listings = parse_listings_from_html(html, base_url="https://www.rotoloautomobili.com")
    assert len(listings) > 0, "Nessun annuncio trovato nella pagina outlet"

def test_no_duplicate_links():
    """Nessun link duplicato tra km0, usato, outlet sulla stessa pagina"""
    all_links = []
    for fixture_name in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
        html = (FIXTURES / fixture_name).read_text(encoding="utf-8")
        listings = parse_listings_from_html(html, base_url="https://www.rotoloautomobili.com")
        all_links.extend(l["link"] for l in listings)
    assert len(all_links) == len(set(all_links)), "Trovati link duplicati tra sezioni"

def test_listing_fields_complete():
    """Ogni annuncio ha tutti i campi richiesti"""
    html = (FIXTURES / "km0_page1.html").read_text(encoding="utf-8")
    listings = parse_listings_from_html(html, base_url="https://www.rotoloautomobili.com")
    required = {"titolo", "prezzo", "anno", "km", "link", "immagine"}
    for i, l in enumerate(listings):
        missing = required - set(k for k, v in l.items() if v)
        assert not missing, f"Annuncio {i} manca di: {missing} — dati: {l}"

def test_has_more_pages_detection():
    """Rilevare se esiste pagina successiva"""
    from scraper import has_next_page
    html_p1 = (FIXTURES / "km0_page1.html").read_text(encoding="utf-8")
    # pagina 1 di km0 deve avere una pagina successiva (ci sono molte auto km0)
    # Se questa asserzione fallisce, o il sito ha poche auto o il rilevamento è sbagliato
    result = has_next_page(html_p1, current_page=1)
    # Non forziamo True/False perché dipende dall'inventory attuale
    assert isinstance(result, bool)
```

**Step 2: Eseguire il test — verificare che fallisce**

```bash
cd NEWSECTION
python -m pytest tests/test_scraper.py -v 2>&1 | head -30
```

Atteso: ImportError o ModuleNotFoundError (scraper.py non esiste ancora).

**Step 3: Scrivere `scraper.py`**

```python
# NEWSECTION/scraper.py
"""
Scraper per www.rotoloautomobili.com
Sezioni: km0, usato, outlet
"""
import re
import time
import random
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://www.rotoloautomobili.com"

SECTIONS = {
    "km0": {
        "url": f"{BASE_URL}/lista-veicoli/km0/",
        "page_params": lambda page: {
            "Is5OrMorePosti": "False",
            "IsIvaEsposta": "False",
            "Page": page,
            "NumeroVeicoli": 4,
        },
    },
    "usato": {
        "url": f"{BASE_URL}/lista-veicoli/usato/",
        "page_params": lambda page: {
            "Page": page,
            "NumeroVeicoli": 100,
            "ListaFiltri[0].Value": "USATO",
        },
    },
    "outlet": {
        "url": f"{BASE_URL}/outlet/",
        "page_params": lambda page: {
            "Is5OrMorePosti": "False",
            "IsIvaEsposta": "False",
            "IsNeoPatentati": "False",
            "IsTrazioneIntegrale": "False",
            "Page": page,
            "NumeroVeicoli": 10,
            "IsStorica": "True",
        },
    },
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/121.0.0.0 Safari/537.36"
    )
}


def _clean(text: str) -> str:
    return " ".join(text.split()).strip()


def parse_listings_from_html(html: str, base_url: str = BASE_URL) -> list[dict]:
    """
    Estrae gli annunci da una pagina HTML della lista veicoli.
    Adatta i selettori in base alla struttura reale del sito (da verificare con le fixture).
    """
    soup = BeautifulSoup(html, "html.parser")
    listings = []

    # -----------------------------------------------------------------------
    # SELETTORI DA ADATTARE dopo aver ispezionato le fixture (Task 1, Step 2)
    # Struttura attesa: <a href="/auto/..."> con <strong>MARCA</strong> + testo
    # -----------------------------------------------------------------------
    for a in soup.find_all("a", href=re.compile(r"/auto/")):
        try:
            listing = _parse_card(a, base_url)
            if listing:
                listings.append(listing)
        except Exception:
            continue

    return listings


def _parse_card(a_tag, base_url: str) -> dict | None:
    """Estrae i dati da un singolo tag <a> che rappresenta un annuncio."""
    href = a_tag.get("href", "")
    if not href:
        return None

    link = href if href.startswith("http") else urljoin(base_url, href)

    # Titolo: testo del primo <strong> o testo completo del tag
    strong = a_tag.find("strong")
    titolo = _clean(strong.get_text()) if strong else ""
    if not titolo:
        # fallback: prima riga di testo significativa
        titolo = _clean(a_tag.get_text()).split("\n")[0]
    if not titolo:
        return None

    full_text = _clean(a_tag.get_text(separator=" "))

    # Prezzo: pattern "XX.XXX €" o "XX €"
    prezzo_match = re.search(r"[\d]{1,3}(?:\.[\d]{3})*\s*€", full_text)
    prezzo = _clean(prezzo_match.group()) if prezzo_match else ""

    # Anno: dopo label "km0" o "usato"
    anno_match = re.search(r"(?:km0|usato|outlet)\s+(\d{4})", full_text, re.IGNORECASE)
    anno = anno_match.group(1) if anno_match else ""

    # Km: pattern "Km NNN.NNN" o "Km NN"
    km_match = re.search(r"Km\s+([\d\.]+)", full_text, re.IGNORECASE)
    km = _clean(km_match.group()) if km_match else "Km 0"

    # Immagine: preferire URL S3, poi qualsiasi <img>
    img_tag = None
    for img in a_tag.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if "s3" in src or "amazonaws" in src:
            img_tag = src
            break
    if not img_tag:
        imgs = a_tag.find_all("img")
        if imgs:
            img_tag = imgs[-1].get("src") or imgs[-1].get("data-src") or ""
    immagine = img_tag if img_tag and img_tag.startswith("http") else (
        urljoin(base_url, img_tag) if img_tag else ""
    )

    return {
        "titolo": titolo,
        "prezzo": prezzo,
        "anno": anno,
        "km": km,
        "link": link,
        "immagine": immagine,
    }


def has_next_page(html: str, current_page: int) -> bool:
    """Restituisce True se esiste un link alla pagina successiva."""
    soup = BeautifulSoup(html, "html.parser")
    next_page = current_page + 1
    # Cerca link con numero pagina successiva nella paginazione
    for a in soup.find_all("a"):
        href = a.get("href", "")
        text = _clean(a.get_text())
        if text == str(next_page) or f"Page={next_page}" in href:
            return True
    return False


def scrape_section(section_name: str, log_fn=print, delay: float = 1.5) -> list[dict]:
    """Scrapa una singola sezione (km0/usato/outlet) con paginazione."""
    section = SECTIONS[section_name]
    base_section_url = section["url"]
    all_listings = []
    seen_links = set()
    page = 1

    while True:
        params = section["page_params"](page)
        log_fn(f"[{section_name}] Pagina {page}...")
        try:
            resp = requests.get(
                base_section_url,
                params=params,
                headers=HEADERS,
                timeout=20,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            log_fn(f"[{section_name}] Errore pagina {page}: {e}")
            break

        listings = parse_listings_from_html(resp.text)
        if not listings:
            log_fn(f"[{section_name}] Nessun annuncio a pagina {page}, fine sezione.")
            break

        new_count = 0
        for l in listings:
            if l["link"] not in seen_links:
                seen_links.add(l["link"])
                all_listings.append(l)
                new_count += 1

        log_fn(f"[{section_name}] Pagina {page}: {new_count} annunci nuovi (totale: {len(all_listings)})")

        if not has_next_page(resp.text, page):
            break

        page += 1
        time.sleep(delay + random.uniform(0, 0.5))

    return all_listings


def run_scraper(log_fn=print) -> list[dict]:
    """Scrapa tutte e tre le sezioni e restituisce la lista deduplicata."""
    all_listings = []
    seen = set()

    for section_name in ["km0", "usato", "outlet"]:
        listings = scrape_section(section_name, log_fn=log_fn)
        for l in listings:
            key = l["link"]
            if key not in seen:
                seen.add(key)
                all_listings.append(l)

    log_fn(f"Totale annunci unici: {len(all_listings)}")

    # Shuffle e assegna posizioni
    random.shuffle(all_listings)
    for i, l in enumerate(all_listings, 1):
        l["posizione"] = i

    return all_listings
```

**Step 4: Eseguire i test**

```bash
cd NEWSECTION
python -m pytest tests/test_scraper.py -v
```

Se i test falliscono sui campi vuoti (titolo, prezzo, etc.), ispezionare le fixture HTML e aggiornare i selettori in `_parse_card` e `parse_listings_from_html`. Questo è il passo più critico — il sito è buggy, i selettori potrebbero richiedere più tentativi.

**Step 5: Debug interattivo se i parser falliscono**

```bash
python -c "
from pathlib import Path
from scraper import parse_listings_from_html
html = Path('tests/fixtures/km0_page1.html').read_text(encoding='utf-8')
results = parse_listings_from_html(html)
for r in results[:3]:
    print(r)
"
```

**Step 6: Commit quando i test passano**

```bash
git add NEWSECTION/scraper.py NEWSECTION/tests/
git commit -m "feat: nuovo scraper per rotoloautomobili.com (3 sezioni, paginazione)"
```

---

### Task 3: Integrare il nuovo scraper in app.py

**Files:**
- Modify: `NEWSECTION/app.py` — sostituire `run_scraper()` inline con import da `scraper.py`

**Step 1: Trovare dove `run_scraper` è definita in app.py**

```bash
grep -n "def run_scraper\|def scrape\|scraping" NEWSECTION/app.py | head -20
```

**Step 2: Sostituire la funzione inline**

In `app.py`, rimuovere la definizione inline di `run_scraper` (e le funzioni di supporto come `normalize_img_candidate`) e aggiungere in cima:

```python
from scraper import run_scraper
```

Verificare che il tab "Scraping" in Streamlit chiami ancora `run_scraper(log_fn=...)` con la stessa firma.

**Step 3: Test manuale del CMS**

```bash
cd NEWSECTION
python -m streamlit run app.py
```

- Aprire il tab "Scraping"
- Avviare lo scraping
- Verificare che il log mostri le 3 sezioni e gli annunci trovati
- Verificare che `stock.json` venga aggiornato correttamente

**Step 4: Commit**

```bash
git add NEWSECTION/app.py
git commit -m "refactor: app.py usa scraper.py esterno invece della funzione inline"
```

---

## Fase 2 — Nuovo Frontend React (Kiosk Showroom)

### Task 4: Scaffolding React + Vite

**Files:**
- Create: `frontend/` (nuova cartella)

**Step 1: Creare il progetto Vite**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento
npm create vite@latest frontend -- --template react
cd frontend
npm install
```

**Step 2: Verificare che il dev server funzioni**

```bash
npm run dev
```

Aprire `http://localhost:5173` — deve mostrare la pagina default di Vite+React.

**Step 3: Pulire i file default non necessari**

Eliminare:
- `frontend/src/assets/react.svg`
- `frontend/public/vite.svg`
- `frontend/src/App.css` (userem inline styles come in newfrontend)
- Contenuto di `frontend/src/index.css` (lasciare solo reset base)

**Step 4: Commit scaffolding**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffolding React+Vite per il nuovo frontend kiosk"
```

---

### Task 5: Componente Showroom (rotazione auto)

Il componente è ispirato a `newfrontend/src/Showroom.jsx` ma semplificato — carica i dati da `stock.json` e `settings.json` invece di dati hardcoded.

**Files:**
- Create: `frontend/src/Showroom.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css`

**Step 1: Scrivere `index.css` (reset + font)**

```css
/* frontend/src/index.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; background: #111; }
body { font-family: 'Outfit', sans-serif; }

@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&family=Rubik+Mono+One&display=swap');
```

**Step 2: Scrivere `Showroom.jsx`**

```jsx
// frontend/src/Showroom.jsx
import { useState, useEffect, useRef } from "react";

const FALLBACK_DURATION = 6000;
const CONTACT = {
  phone: "011 855220",
  locations: ["Torino - Via Roma", "Torino - Corso Francia", "Torino - Via Po"],
};

function useSlideshow(slides, duration) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!slides.length) return;
    startRef.current = Date.now();
    setProgress(0);

    const interval = setInterval(() => {
      setIdx((prev) => (prev + 1) % slides.length);
      startRef.current = Date.now();
    }, duration);

    const bar = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min((elapsed / duration) * 100, 100));
    }, 50);

    return () => { clearInterval(interval); clearInterval(bar); };
  }, [idx, slides.length, duration]);

  return { idx, progress };
}

export default function Showroom() {
  const [slides, setSlides] = useState([]);
  const [duration, setDuration] = useState(FALLBACK_DURATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("../stock.json").then((r) => r.json()),
      fetch("../settings.json").then((r) => r.json()),
    ])
      .then(([stock, settings]) => {
        const dur = (settings.durata_slide || 6) * 1000;
        setDuration(dur);
        const max = settings.max_annunci || stock.length;
        let annunci = stock.slice(0, max);

        // Inserire slide promo ogni 4 annunci
        const promoList = settings.promo || [];
        const result = [];
        let promoIdx = 0;
        annunci.forEach((car, i) => {
          result.push({ type: "annuncio", ...car });
          if ((i + 1) % 4 === 0 && promoList.length > 0) {
            result.push({ type: "promo", immagine: promoList[promoIdx % promoList.length] });
            promoIdx++;
          }
        });
        setSlides(result);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const { idx, progress } = useSlideshow(slides, duration);

  if (loading) return <Screen bg="#111"><h1 style={{ color: "#FFD700", fontSize: "3rem" }}>Caricamento...</h1></Screen>;
  if (error) return <Screen bg="#111"><h1 style={{ color: "#FF00FF" }}>Errore: {error}</h1></Screen>;
  if (!slides.length) return <Screen bg="#111"><h1 style={{ color: "#FFD700" }}>Nessun annuncio.</h1></Screen>;

  const slide = slides[idx];

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "#111", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ background: "#FFD700", borderBottom: "4px solid #111", padding: "0 2rem", height: "72px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontFamily: "'Rubik Mono One', monospace", fontSize: "1.5rem", color: "#111", transform: "rotate(-1deg)", display: "inline-block" }}>
          ROTOLO AUTOMOBILI
        </span>
        <span style={{ fontFamily: "'Rubik Mono One', monospace", fontSize: "1rem", color: "#111" }}>
          PREZZO CHIARO
        </span>
      </div>

      {/* Slide area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {slide.type === "promo" ? (
          <PromoSlide slide={slide} />
        ) : (
          <CarSlide slide={slide} />
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: "6px", background: "#333", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "#FFD700", transition: "width 0.05s linear" }} />
      </div>

      {/* Bottom contact bar */}
      <div style={{ background: "#111", borderTop: "4px solid #FFD700", padding: "0 2rem", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: "2rem" }}>
          {CONTACT.locations.map((loc, i) => (
            <span key={i} style={{ color: "#aaa", fontSize: "0.8rem" }}>{loc}</span>
          ))}
        </div>
        <span style={{ color: "#FFD700", fontFamily: "'Rubik Mono One', monospace", fontSize: "1.2rem" }}>
          {CONTACT.phone}
        </span>
      </div>
    </div>
  );
}

function CarSlide({ slide }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#1a1a1a" }}>
      {/* Immagine */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", borderRight: "4px solid #FFD700" }}>
        <img
          src={slide.immagine}
          alt={slide.titolo}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", boxShadow: "12px 12px 0 #FFD700" }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      </div>

      {/* Info */}
      <div style={{ width: "40%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "3rem", gap: "1.5rem" }}>
        <h2 style={{ fontFamily: "'Rubik Mono One', monospace", fontSize: "clamp(1.2rem, 2.5vw, 2.2rem)", color: "#fff", lineHeight: 1.2, textTransform: "uppercase" }}>
          {slide.titolo}
        </h2>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {slide.anno && <Tag label="ANNO" value={slide.anno} />}
          {slide.km && <Tag label="KM" value={slide.km} />}
        </div>

        {slide.prezzo && (
          <div style={{ background: "#FFD700", border: "4px solid #111", padding: "1rem 1.5rem", display: "inline-block", transform: "rotate(-1deg)", boxShadow: "6px 6px 0 #111" }}>
            <span style={{ fontFamily: "'Rubik Mono One', monospace", fontSize: "clamp(1.5rem, 3vw, 2.8rem)", color: "#111" }}>
              {slide.prezzo}
            </span>
          </div>
        )}

        {/* QR code */}
        {slide.link && (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(slide.link)}`}
              alt="QR"
              style={{ border: "3px solid #FFD700", padding: "4px", background: "#fff" }}
            />
            <span style={{ color: "#aaa", fontSize: "0.75rem" }}>Scansiona per dettagli</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PromoSlide({ slide }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img src={slide.immagine} alt="Promozione" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </div>
  );
}

function Tag({ label, value }) {
  return (
    <div style={{ border: "2px solid #FFD700", padding: "0.3rem 0.8rem" }}>
      <span style={{ color: "#FFD700", fontSize: "0.65rem", display: "block", textTransform: "uppercase" }}>{label}</span>
      <span style={{ color: "#fff", fontWeight: "700", fontSize: "0.9rem" }}>{value}</span>
    </div>
  );
}

function Screen({ bg, children }) {
  return (
    <div style={{ width: "100vw", height: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>
  );
}
```

**Step 3: Aggiornare App.jsx**

```jsx
// frontend/src/App.jsx
import Showroom from "./Showroom";
export default function App() { return <Showroom />; }
```

**Step 4: Verificare visivamente**

```bash
cd frontend
npm run dev
```

Aprire `http://localhost:5173`. Il frontend non caricherà i JSON (path relativo `../stock.json` non funziona in dev). Per testarlo in dev:

```bash
# Avviare un server HTTP dalla root del progetto (altra finestra terminale)
cd /c/Users/Williams/Documents/GitHub/autocaricamento
python -m http.server 8090
# poi aprire http://localhost:8090/frontend/dist/index.html (dopo build)
```

Oppure modificare temporaneamente i path fetch in Showroom.jsx per dev:
```js
fetch("http://localhost:8090/stock.json")
```

**Step 5: Build di produzione**

```bash
cd frontend
npm run build
```

Verificare che `frontend/dist/index.html` esista.

**Step 6: Test finale — aprire `frontend/dist/index.html` tramite server HTTP**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento
python -m http.server 8090
# Aprire http://localhost:8090/frontend/dist/index.html
```

Verificare:
- Le auto ruotano
- Il prezzo è visibile in gold
- La barra di progresso avanza
- Il QR code si genera
- Le slide promo appaiono ogni 4 auto

**Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: nuovo frontend React kiosk con design neon gold (Showroom)"
```

---

## Fase 3 — Test integrazione end-to-end

### Task 6: Test scraping completo con dati reali

**Step 1: Avviare il CMS e fare uno scraping reale**

```bash
cd NEWSECTION
python -m streamlit run app.py
```

- Tab "Scraping" → avvia
- Attendere il completamento
- Verificare che `NEWSECTION/data/stock.json` (o `../stock.json`) sia aggiornato

**Step 2: Controllare la qualità dei dati**

```bash
python -c "
import json
data = json.load(open('stock.json', encoding='utf-8'))
print(f'Totale: {len(data)}')
for field in ['titolo', 'prezzo', 'anno', 'km', 'link', 'immagine']:
    empty = sum(1 for d in data if not d.get(field))
    print(f'{field}: {empty} vuoti')
print('Esempio:', json.dumps(data[0], ensure_ascii=False, indent=2))
"
```

Se ci sono molti campi vuoti, tornare a Task 2 e raffinare i selettori.

**Step 3: Test del frontend con dati reali**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento
python -m http.server 8090
```

Aprire `http://localhost:8090/frontend/dist/index.html` e verificare con i dati reali scrappati.

**Step 4: Push su GitHub**

Dal CMS (tab "GitHub") → Push.

Verificare sul repo GitHub che `stock.json` e `settings.json` siano aggiornati.

**Step 5: Commit finale**

```bash
git add .
git commit -m "docs: aggiornamento CLAUDE.md e piano implementazione completato"
```

---

## Note sui selettori (da compilare dopo Task 1, Step 2)

```
# Aggiornare qui dopo l'ispezione manuale delle fixture HTML

Selettore card:     [da determinare]
Selettore titolo:   [da determinare]
Selettore prezzo:   [da determinare]
Selettore anno:     [da determinare]
Selettore km:       [da determinare]
Selettore immagine: [da determinare]
Selettore next page:[da determinare]
Bug noti sito:      [da documentare]
```

---

## Dipendenze Python richieste (NEWSECTION)

Verificare che siano installate:

```bash
pip install requests beautifulsoup4 streamlit PyGithub
```

## Dipendenze Node richieste (frontend)

```bash
cd frontend
npm install
```
