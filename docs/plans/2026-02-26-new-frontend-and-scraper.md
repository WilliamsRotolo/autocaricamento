# New Frontend (Showroom) + Scraper Aggiornato Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Creare un nuovo frontend React per il kiosk (basato su `newfrontend/Showroom.jsx`) e aggiornare lo scraper del CMS per il nuovo sito `www.rotoloautomobili.com` (3 sezioni: km0, usato, outlet).

**Architecture:**
- Frontend React+Vite buildato direttamente nella root del repo (`outDir: '..'`, `base: './'`). GitHub Pages continua a servire dalla root, i TV puntano allo stesso URL di prima. Il CMS aggiorna solo i JSON — non serve rebuilddare il frontend per ogni aggiornamento dati.
- Il CMS Streamlit (`NEWSECTION/`) importa un nuovo `scraper.py` che sostituisce la funzione inline. Gestisce 3 sezioni con paginazione (Page=N, si ferma quando la pagina non restituisce annunci).

**Tech Stack:** React 18 + Vite, Python 3 + BeautifulSoup4 + requests, Streamlit

---

## HTML Structure (verificata il 26/02/2026)

Tutte e tre le sezioni (km0, usato, outlet) usano la stessa struttura di card:

```html
<a href="/auto/{tipo}/{slug}-{city}-{fuel}-{id}/">
  <img src="https://loghiqr.ibi.it/marche_HD/NNN.png" alt="logo MARCA">   <!-- IGNORARE: logo marca -->
  <span>usato 2025</span>   <!-- oppure "km0 2025" -->
  <img src="https://mulitpubblicatorebucket.s3.eu-central-1.amazonaws.com/..." alt="MARCA MODELLO">
  <!-- oppure: <img src="/img/no_photo_default.jpg"> quando non c'è foto -->
  <strong>MARCA</strong> MODELLO_BASE
  <h3>VARIANTE</h3>           <!-- km0 e usato usano <h3> -->
  <!-- oppure <span>VARIANTE</span> in outlet -->
  <span>Km 0</span>           <!-- km0 e usato: span con testo "Km NNN" -->
  <!-- oppure: <strong>Km</strong> 203.000  in outlet -->
  <span>Alimentazione Elettrica/Benzina</span>
  <span>Cambio automatico</span>
  <span>17.990 €</span>
</a>
```

**Bug noti del sito:**
- `numberOfItems: 0` nel JSON-LD schema.org anche quando ci sono annunci
- Prezzo in schema.org diverso da quello visualizzato → usare il prezzo visualizzato (testo)
- URL S3 con typo: "mulitpubblicatorebucket" (non "multi") — è corretto così
- Pagina usato: NumeroVeicoli=100 come parametro ma mostra ~12 auto a pagina
- Outlet usa `<strong>Km</strong> NNN` invece di `<span>Km NNN</span>`

**Paginazione:** Link numerati `Page=1`, `Page=2`, ... — nessun "next" button. Stop quando parse_listings_from_html restituisce lista vuota.

**Nuovo campo immatricolazione**: dalla pagina di dettaglio è disponibile la data di immatricolazione, ma per lo scraper usiamo l'anno dalla card listing che è sufficiente per la visualizzazione.

---

## Fase 1 — Scraper aggiornato (Python)

### Task 1: Scaricare fixture HTML per i test

Le fixture HTML servono come dati reali e stabili per i test del parser.

**Files da creare:**
- `NEWSECTION/tests/__init__.py` (vuoto)
- `NEWSECTION/tests/fixtures/km0_page1.html`
- `NEWSECTION/tests/fixtures/km0_page2.html`
- `NEWSECTION/tests/fixtures/usato_page1.html`
- `NEWSECTION/tests/fixtures/usato_page2.html`
- `NEWSECTION/tests/fixtures/outlet_page1.html`

**Step 1: Creare la struttura cartelle**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento/NEWSECTION
mkdir -p tests/fixtures
touch tests/__init__.py
```

**Step 2: Scaricare le fixture**

```bash
python -c "
import requests, pathlib
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
pages = [
    ('km0_page1',    'https://www.rotoloautomobili.com/lista-veicoli/km0/'),
    ('km0_page2',    'https://www.rotoloautomobili.com/lista-veicoli/km0/?Page=2&NumeroVeicoli=4'),
    ('usato_page1',  'https://www.rotoloautomobili.com/lista-veicoli/usato/'),
    ('usato_page2',  'https://www.rotoloautomobili.com/lista-veicoli/usato/?Page=2&NumeroVeicoli=100&ListaFiltri[0].Value=USATO'),
    ('outlet_page1', 'https://www.rotoloautomobili.com/outlet/'),
]
for name, url in pages:
    r = requests.get(url, headers=HEADERS, timeout=20)
    path = pathlib.Path('tests/fixtures') / f'{name}.html'
    path.write_text(r.text, encoding='utf-8')
    print(f'{name}: {r.status_code}, {len(r.text):,} bytes')
"
```

**Step 3: Verifica rapida dei file scaricati**

```bash
python -c "
import pathlib, re
for f in sorted(pathlib.Path('tests/fixtures').glob('*.html')):
    html = f.read_text(encoding='utf-8')
    links = re.findall(r'href=\"/auto/', html)
    print(f'{f.name}: {len(links)} annunci trovati con /auto/')
"
```

Atteso: ogni file deve avere almeno 1 link `/auto/`. Se km0 ne ha 0, il sito è down o ha cambiato struttura.

**Step 4: Commit fixture**

```bash
git add NEWSECTION/tests/
git commit -m "test: fixture HTML per scraper rotoloautomobili.com"
```

---

### Task 2: Scrivere `scraper.py` con test

**Files:**
- Create: `NEWSECTION/scraper.py`
- Create: `NEWSECTION/tests/test_scraper.py`

**Step 1: Scrivere i test PRIMA dell'implementazione**

```python
# NEWSECTION/tests/test_scraper.py
"""
Test del parser scraper per rotoloautomobili.com.
Usa fixture HTML reali scaricate in Task 1.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import pytest
from pathlib import Path
from scraper import parse_listings_from_html, has_next_page

FIXTURES = Path(__file__).parent / "fixtures"
BASE = "https://www.rotoloautomobili.com"


# ── Parsing base ──────────────────────────────────────────────────────────────

class TestParseListings:
    def test_km0_restituisce_annunci(self):
        html = (FIXTURES / "km0_page1.html").read_text(encoding="utf-8")
        listings = parse_listings_from_html(html, BASE)
        assert len(listings) > 0, "km0 page1: nessun annuncio trovato"

    def test_usato_restituisce_annunci(self):
        html = (FIXTURES / "usato_page1.html").read_text(encoding="utf-8")
        listings = parse_listings_from_html(html, BASE)
        assert len(listings) > 0, "usato page1: nessun annuncio trovato"

    def test_outlet_restituisce_annunci(self):
        html = (FIXTURES / "outlet_page1.html").read_text(encoding="utf-8")
        listings = parse_listings_from_html(html, BASE)
        assert len(listings) > 0, "outlet page1: nessun annuncio trovato"

    def test_nessun_duplicato_nella_stessa_pagina(self):
        """Ogni link deve essere unico dentro una singola pagina."""
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            html = (FIXTURES / fixture).read_text(encoding="utf-8")
            listings = parse_listings_from_html(html, BASE)
            links = [l["link"] for l in listings]
            assert len(links) == len(set(links)), f"{fixture}: link duplicati: {links}"


# ── Campi obbligatori ─────────────────────────────────────────────────────────

class TestCampiObbligatori:
    REQUIRED = {"titolo", "prezzo", "link"}

    def _check_section(self, fixture_name):
        html = (FIXTURES / fixture_name).read_text(encoding="utf-8")
        listings = parse_listings_from_html(html, BASE)
        assert listings, f"{fixture_name}: lista vuota"
        for i, l in enumerate(listings):
            missing = {k for k in self.REQUIRED if not l.get(k)}
            assert not missing, f"{fixture_name}[{i}] manca: {missing}\ndati: {l}"

    def test_km0_campi_obbligatori(self):      self._check_section("km0_page1.html")
    def test_usato_campi_obbligatori(self):    self._check_section("usato_page1.html")
    def test_outlet_campi_obbligatori(self):   self._check_section("outlet_page1.html")


# ── Formato dei campi ─────────────────────────────────────────────────────────

class TestFormatoCampi:
    def _listings(self, name):
        html = (FIXTURES / name).read_text(encoding="utf-8")
        return parse_listings_from_html(html, BASE)

    def test_link_assoluto(self):
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            for l in self._listings(fixture):
                assert l["link"].startswith("https://"), f"link non assoluto: {l['link']}"

    def test_immagine_non_logo_marca(self):
        """L'immagine non deve essere il logo della marca (loghiqr.ibi.it)."""
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            for l in self._listings(fixture):
                img = l.get("immagine", "")
                assert "loghiqr.ibi.it" not in img, f"Immagine è logo marca: {img}"

    def test_immagine_placeholder_se_nessuna_foto(self):
        """Se il sito usa no_photo_default.jpg, immagine deve essere stringa vuota o placeholder."""
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            for l in self._listings(fixture):
                img = l.get("immagine", "")
                assert "no_photo_default" not in img, (
                    f"Immagine default non filtrata: {img} in annuncio {l['titolo']}"
                )

    def test_prezzo_contiene_euro(self):
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            for l in self._listings(fixture):
                if l.get("prezzo"):
                    assert "€" in l["prezzo"], f"Prezzo senza €: {l['prezzo']}"

    def test_anno_quattro_cifre_o_vuoto(self):
        import re
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            for l in self._listings(fixture):
                anno = l.get("anno", "")
                if anno:
                    assert re.match(r"^\d{4}$", anno), f"Anno non valido: {anno!r}"

    def test_km_formato_corretto(self):
        """km deve essere numerico o stringa vuota."""
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            for l in self._listings(fixture):
                km = l.get("km", "")
                if km:
                    # Accetta "0", "10.000", "203.000" ecc.
                    assert any(c.isdigit() for c in km), f"km non numerico: {km!r}"

    def test_titolo_contiene_marca(self):
        """Il titolo deve avere almeno 2 parole (marca + modello)."""
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            for l in self._listings(fixture):
                words = l.get("titolo", "").split()
                assert len(words) >= 2, f"Titolo troppo corto: {l['titolo']!r}"


# ── Paginazione ───────────────────────────────────────────────────────────────

class TestPaginazione:
    def test_has_next_page_restituisce_bool(self):
        html = (FIXTURES / "km0_page1.html").read_text(encoding="utf-8")
        result = has_next_page(html, current_page=1)
        assert isinstance(result, bool)

    def test_pagina_2_ha_annunci(self):
        """Se la pagina 2 esiste come fixture, deve avere annunci."""
        f = FIXTURES / "usato_page2.html"
        if f.exists():
            html = f.read_text(encoding="utf-8")
            listings = parse_listings_from_html(html, BASE)
            assert len(listings) > 0, "usato page2: nessun annuncio"

    def test_links_diversi_tra_pagine(self):
        """pagina 1 e pagina 2 devono avere link diversi (nessuna ripetizione)."""
        f1 = FIXTURES / "usato_page1.html"
        f2 = FIXTURES / "usato_page2.html"
        if not (f1.exists() and f2.exists()):
            pytest.skip("fixture page2 non presente")
        links1 = {l["link"] for l in parse_listings_from_html(f1.read_text(encoding="utf-8"), BASE)}
        links2 = {l["link"] for l in parse_listings_from_html(f2.read_text(encoding="utf-8"), BASE)}
        overlap = links1 & links2
        assert not overlap, f"Link ripetuti tra pagina 1 e 2: {overlap}"
```

**Step 2: Verificare che i test falliscano (scraper.py non esiste)**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento/NEWSECTION
python -m pytest tests/test_scraper.py -v 2>&1 | head -20
```

Atteso: `ModuleNotFoundError: No module named 'scraper'`

**Step 3: Implementare `scraper.py`**

```python
# NEWSECTION/scraper.py
"""
Scraper per www.rotoloautomobili.com — 3 sezioni: km0, usato, outlet.

Struttura card HTML (verificata 26/02/2026):
  <a href="/auto/{tipo}/{slug}-{id}/">
    <img src="https://loghiqr.ibi.it/...">  <- LOGO MARCA, ignorare
    <span>usato 2025</span>                 <- anno
    <img src="https://mulitpubblicatorebucket.s3..."> <- foto auto
    <strong>MARCA</strong> MODELLO_BASE
    <h3>VARIANTE</h3>                       <- km0/usato; outlet usa <span>
    <span>Km 0</span>                       <- km0/usato
    <strong>Km</strong> 203.000             <- outlet (strong invece di span)
    <span>Alimentazione Diesel</span>
    <span>Cambio manuale</span>
    <span>4.890 €</span>
  </a>

Bug noti: numberOfItems=0 in JSON-LD, prezzo schema!=prezzo display, typo "mulitpubblicatorebucket".
"""
import re
import time
import random
import logging
import requests
from bs4 import BeautifulSoup, Tag
from urllib.parse import urljoin

logger = logging.getLogger(__name__)

BASE_URL = "https://www.rotoloautomobili.com"
NO_PHOTO_MARKER = "/img/no_photo_default.jpg"
LOGO_DOMAIN = "loghiqr.ibi.it"

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
    ),
    "Accept-Language": "it-IT,it;q=0.9",
}


def _clean(text: str) -> str:
    """Normalizza whitespace."""
    return " ".join(text.split()).strip()


def _abs_url(url: str, base: str = BASE_URL) -> str:
    """Converte URL relativo in assoluto."""
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("http"):
        return url
    return urljoin(base, url)


def _extract_image(a_tag: Tag) -> str:
    """
    Estrae URL immagine dell'auto dalla card.
    - Salta il logo marca (loghiqr.ibi.it)
    - Salta il placeholder no_photo_default.jpg
    - Preferisce immagini S3 (amazonaws)
    - Restituisce stringa vuota se non trovata
    """
    candidates = []
    for img in a_tag.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src:
            continue
        if LOGO_DOMAIN in src:
            continue
        if NO_PHOTO_MARKER in src:
            continue
        candidates.append(src)

    if not candidates:
        return ""

    # Preferire S3
    for c in candidates:
        if "amazonaws" in c or "s3" in c:
            return _abs_url(c)

    return _abs_url(candidates[0])


def _extract_km(a_tag: Tag) -> str:
    """
    Gestisce due varianti:
    - km0/usato: <span>Km 0</span> o <span>Km 10</span>
    - outlet:    <strong>Km</strong> 203.000  (km in strong separato dal numero)
    """
    full_text = a_tag.get_text(separator=" ")
    # Pattern generico: "Km" seguito da numero (con o senza punti)
    m = re.search(r"\bKm\s+([\d][.\d]*)", full_text, re.IGNORECASE)
    if m:
        return m.group(1).replace(".", "").strip()  # ritorna numero puro, es. "203000"
    return ""


def _extract_titolo(a_tag: Tag) -> str:
    """
    Costruisce titolo completo: MARCA MODELLO_BASE VARIANTE
    - MARCA: testo del primo <strong> (che non sia "Km")
    - MODELLO_BASE: testo inline dopo il <strong> marca (nodo testo diretto)
    - VARIANTE: contenuto del <h3> oppure dello <span> successivo significativo
    """
    # Trovare il <strong> della marca (non "Km")
    marca = ""
    marca_tag = None
    for strong in a_tag.find_all("strong"):
        text = _clean(strong.get_text())
        if text.lower() != "km" and text:
            marca = text
            marca_tag = strong
            break

    if not marca:
        return ""

    # Modello base: testo diretto dopo il <strong> marca (nodo NavigableString)
    modello_base = ""
    if marca_tag:
        for sibling in marca_tag.next_siblings:
            if isinstance(sibling, str):
                t = _clean(sibling)
                if t:
                    modello_base = t
                    break
            elif hasattr(sibling, "name") and sibling.name in ("br",):
                break
            elif hasattr(sibling, "name") and sibling.name in ("h3", "span", "div"):
                break

    # Variante: <h3> oppure <span> con testo che non sia anno/km/alimentazione/cambio/prezzo
    variante = ""
    h3 = a_tag.find("h3")
    if h3:
        variante = _clean(h3.get_text())
    else:
        # outlet non usa h3: cerca span dopo il modello_base
        skip_patterns = re.compile(
            r"^(km0|usato|outlet|\d{4}|km\s+|alimentazione|cambio|\d[\d\.]*\s*€)",
            re.IGNORECASE,
        )
        for span in a_tag.find_all("span"):
            t = _clean(span.get_text())
            if t and not skip_patterns.match(t):
                variante = t
                break

    parts = [p for p in [marca, modello_base, variante] if p]
    return " ".join(parts)


def parse_listings_from_html(html: str, base_url: str = BASE_URL) -> list[dict]:
    """
    Estrae tutti gli annunci da una pagina listing.
    Restituisce lista di dict con: titolo, prezzo, anno, km, alimentazione, cambio, link, immagine.
    """
    soup = BeautifulSoup(html, "html.parser")
    listings = []

    for a in soup.find_all("a", href=re.compile(r"^/auto/")):
        try:
            listing = _parse_card(a, base_url)
            if listing and listing.get("titolo"):
                listings.append(listing)
        except Exception as e:
            logger.debug(f"Errore parsing card: {e}")
            continue

    return listings


def _parse_card(a_tag: Tag, base_url: str) -> dict | None:
    href = a_tag.get("href", "")
    if not href or "/auto/" not in href:
        return None

    link = _abs_url(href, base_url)
    full_text = a_tag.get_text(separator=" ")

    # Anno: "km0 2025" o "usato 2018"
    anno_m = re.search(r"(?:km0|usato|outlet)\s+(\d{4})", full_text, re.IGNORECASE)
    anno = anno_m.group(1) if anno_m else ""

    # Prezzo: formato "17.990 €" o "4.890 €" (il prezzo visualizzato, non schema.org)
    prezzo_m = re.search(r"(\d{1,3}(?:\.\d{3})*)\s*€", full_text)
    prezzo = (prezzo_m.group(1) + " €") if prezzo_m else ""

    # Alimentazione
    alim_m = re.search(r"Alimentazione\s+(.+?)(?:\s{2,}|Cambio|$)", full_text, re.IGNORECASE)
    alimentazione = _clean(alim_m.group(1)) if alim_m else ""

    # Cambio
    cambio_m = re.search(r"Cambio\s+(\w+)", full_text, re.IGNORECASE)
    cambio = _clean(cambio_m.group(1)) if cambio_m else ""

    return {
        "titolo": _extract_titolo(a_tag),
        "prezzo": prezzo,
        "anno": anno,
        "km": _extract_km(a_tag),
        "alimentazione": alimentazione,
        "cambio": cambio,
        "link": link,
        "immagine": _extract_image(a_tag),
    }


def has_next_page(html: str, current_page: int) -> bool:
    """
    True se nella paginazione esiste un link per current_page+1.
    Cerca sia il testo numerico che il parametro Page= nell'href.
    """
    soup = BeautifulSoup(html, "html.parser")
    next_n = current_page + 1
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        text = _clean(a.get_text())
        if f"Page={next_n}" in href or text == str(next_n):
            return True
    return False


def scrape_section(section_name: str, log_fn=print, delay: float = 1.5) -> list[dict]:
    """Scrapa una sezione completa con paginazione."""
    cfg = SECTIONS[section_name]
    all_listings: list[dict] = []
    seen_links: set[str] = set()
    page = 1
    consecutive_empty = 0

    while True:
        params = cfg["page_params"](page)
        log_fn(f"[{section_name}] Pagina {page}...")

        try:
            resp = requests.get(cfg["url"], params=params, headers=HEADERS, timeout=20)
            resp.raise_for_status()
        except requests.RequestException as e:
            log_fn(f"[{section_name}] Errore rete pagina {page}: {e}")
            break

        listings = parse_listings_from_html(resp.text)

        if not listings:
            consecutive_empty += 1
            log_fn(f"[{section_name}] Pagina {page} vuota (tentativo {consecutive_empty}/2).")
            if consecutive_empty >= 2:
                break
            page += 1
            time.sleep(delay)
            continue

        consecutive_empty = 0
        new = [l for l in listings if l["link"] not in seen_links]
        for l in new:
            seen_links.add(l["link"])
            all_listings.append(l)

        log_fn(f"[{section_name}] Pagina {page}: +{len(new)} nuovi (tot: {len(all_listings)})")

        if not has_next_page(resp.text, page):
            log_fn(f"[{section_name}] Nessuna pagina successiva, fine sezione.")
            break

        page += 1
        time.sleep(delay + random.uniform(0, 0.5))

    return all_listings


def run_scraper(log_fn=print) -> list[dict]:
    """Scrapa tutte e tre le sezioni, deduplica, assegna posizioni."""
    all_listings: list[dict] = []
    seen: set[str] = set()

    for section_name in ["km0", "usato", "outlet"]:
        for l in scrape_section(section_name, log_fn=log_fn):
            if l["link"] not in seen:
                seen.add(l["link"])
                all_listings.append(l)

    log_fn(f"Totale annunci unici: {len(all_listings)}")
    random.shuffle(all_listings)
    for i, l in enumerate(all_listings, 1):
        l["posizione"] = i

    return all_listings
```

**Step 4: Eseguire i test**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento/NEWSECTION
python -m pytest tests/test_scraper.py -v
```

Se i test falliscono:
- `test_immagine_non_logo_marca` → verificare `_extract_image`, controllare con `print(a_tag.prettify())` su una fixture
- `test_titolo_contiene_marca` → verificare `_extract_titolo` con stampa dei nodi del primo `<a>`
- `test_km_formato_corretto` → verificare `_extract_km` sulla fixture outlet

Debug interattivo:
```bash
python -c "
from pathlib import Path
from scraper import parse_listings_from_html
html = Path('tests/fixtures/outlet_page1.html').read_text(encoding='utf-8')
for r in parse_listings_from_html(html)[:3]:
    print(r)
"
```

**Step 5: Commit**

```bash
git add NEWSECTION/scraper.py NEWSECTION/tests/
git commit -m "feat: scraper.py per rotoloautomobili.com con test (km0/usato/outlet)"
```

---

### Task 3: Integrare il nuovo scraper in `app.py`

**Files:**
- Modify: `NEWSECTION/app.py`

**Step 1: Trovare le funzioni da rimuovere in app.py**

```bash
grep -n "def run_scraper\|def normalize_img\|def scrape\|requests.get" NEWSECTION/app.py | head -30
```

**Step 2: Sostituire la funzione inline**

In `app.py`:
1. Aggiungere in cima (dopo gli import esistenti): `from scraper import run_scraper`
2. Rimuovere la definizione `def run_scraper(...)` e tutte le sue funzioni helper (`normalize_img_candidate`, eventuali variabili di sezione, etc.)
3. Verificare che il tab "Scraping" chiami `run_scraper(log_fn=...)` con firma identica

**Step 3: Verificare che app.py importi correttamente**

```bash
cd NEWSECTION
python -c "import app; print('OK')"
```

Atteso: `OK` senza errori.

**Step 4: Test manuale breve dello scraping**

```bash
python -c "
from scraper import scrape_section
results = scrape_section('km0', log_fn=print, delay=0)
print(f'km0: {len(results)} annunci')
if results:
    import json; print(json.dumps(results[0], ensure_ascii=False, indent=2))
"
```

**Step 5: Commit**

```bash
git add NEWSECTION/app.py
git commit -m "refactor: app.py importa scraper.py, rimosso codice scraping inline"
```

---

## Fase 2 — Nuovo Frontend React (Kiosk Showroom)

### Task 4: Scaffolding React + Vite con configurazione GitHub Pages

**Files:**
- Create: `frontend/` (directory)
- Create: `frontend/vite.config.js`

**Step 1: Creare il progetto Vite**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento
npm create vite@latest frontend -- --template react
cd frontend
npm install
```

**Step 2: Configurare `vite.config.js` per GitHub Pages**

Il build deve outputtare nella root del repo (dove stanno `stock.json` e `settings.json`) così GitHub Pages serve tutto dalla stessa origine.

```js
// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',           // path relativi → funziona su GitHub Pages e in locale
  build: {
    outDir: '..',       // output nella root del repo
    emptyOutDir: false, // NON cancellare altri file nella root
    rollupOptions: {
      output: {
        // cartella assets/ nella root, non sovrascrive stock.json ecc.
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      }
    }
  },
})
```

**Step 3: Pulire i file default**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento/frontend
# Rimuovere file non necessari
rm -f src/assets/react.svg public/vite.svg src/App.css
```

Svuotare `src/index.css` (verrà riscritto nel Task 5).

**Step 4: Verificare che il dev server parta**

```bash
npm run dev
```

Aprire `http://localhost:5173` — deve mostrare la pagina default React (con errore di stile va bene per ora).

**Step 5: Verificare che il build scriva nella root**

```bash
npm run build
ls ../*.html  # deve mostrare index.html nella root del repo
```

**Step 6: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffolding React+Vite con output build su root per GitHub Pages"
```

---

### Task 5: Componente Showroom

**Files:**
- Create: `frontend/src/Showroom.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css`

**Nota su `stock.json`:** Il percorso `./stock.json` funziona in produzione (GitHub Pages) poiché il build va nella root. In dev (`npm run dev` sulla porta 5173) il file non è raggiungibile — usare `python -m http.server 8090` nella root e aprire `http://localhost:8090` per test visivi.

**Step 1: Scrivere `index.css`**

```css
/* frontend/src/index.css */
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&family=Rubik+Mono+One&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; overflow: hidden; background: #111; }
body { font-family: 'Outfit', sans-serif; }
```

**Step 2: Scrivere `Showroom.jsx`**

```jsx
// frontend/src/Showroom.jsx
import { useState, useEffect, useRef } from "react";

// ── Configurazione contatti (aggiornare con i dati reali) ──────────────────
const CONTACT = {
  phone: "011 855220",
  locations: [
    "Via Nizza 5 - Torino",
    "Corso Unità d'Italia 13 - Torino",
    "Via Filadelfia 157 - Torino",
  ],
};

// ── Hook slideshow ─────────────────────────────────────────────────────────
function useSlideshow(slides, duration) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!slides.length || duration <= 0) return;
    startRef.current = Date.now();
    setProgress(0);

    const slide = setInterval(() => {
      setIdx((prev) => (prev + 1) % slides.length);
    }, duration);

    const bar = setInterval(() => {
      const pct = Math.min(((Date.now() - startRef.current) / duration) * 100, 100);
      setProgress(pct);
    }, 50);

    return () => { clearInterval(slide); clearInterval(bar); };
  }, [idx, slides.length, duration]);

  return { idx, progress };
}

// ── Componente principale ──────────────────────────────────────────────────
export default function Showroom() {
  const [slides, setSlides] = useState([]);
  const [duration, setDuration] = useState(6000);
  const [status, setStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("./stock.json").then((r) => { if (!r.ok) throw new Error("stock.json non trovato"); return r.json(); }),
      fetch("./settings.json").then((r) => { if (!r.ok) throw new Error("settings.json non trovato"); return r.json(); }),
    ])
      .then(([stock, settings]) => {
        const dur = Math.max((settings.durata_slide || 6) * 1000, 2000);
        setDuration(dur);

        const max = settings.max_annunci || stock.length;
        const annunci = Array.isArray(stock) ? stock.slice(0, max) : [];
        const promoList = Array.isArray(settings.promo) ? settings.promo : [];

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
        setStatus(result.length > 0 ? "ready" : "error");
        if (result.length === 0) setErrMsg("Nessun annuncio in stock.json");
      })
      .catch((e) => { setErrMsg(e.message); setStatus("error"); });
  }, []);

  const { idx, progress } = useSlideshow(slides, duration);

  if (status === "loading") return <FullScreen><Spinner /></FullScreen>;
  if (status === "error")   return <FullScreen><ErrorMsg msg={errMsg} /></FullScreen>;

  const slide = slides[idx];

  return (
    <div style={s.root}>
      <TopBar />
      <div style={s.slideArea}>
        {slide.type === "promo"
          ? <PromoSlide slide={slide} />
          : <CarSlide slide={slide} />}
      </div>
      <ProgressBar pct={progress} />
      <BottomBar />
    </div>
  );
}

// ── Sotto-componenti ───────────────────────────────────────────────────────

function TopBar() {
  return (
    <div style={s.topBar}>
      <span style={s.brandTitle}>ROTOLO AUTOMOBILI</span>
      <span style={s.brandSub}>PREZZO CHIARO · NESSUNA SORPRESA</span>
    </div>
  );
}

function ProgressBar({ pct }) {
  return (
    <div style={s.progressTrack}>
      <div style={{ ...s.progressFill, width: `${pct}%` }} />
    </div>
  );
}

function BottomBar() {
  return (
    <div style={s.bottomBar}>
      <div style={s.locations}>
        {CONTACT.locations.map((loc, i) => (
          <span key={i} style={s.locText}>{loc}</span>
        ))}
      </div>
      <span style={s.phone}>{CONTACT.phone}</span>
    </div>
  );
}

function CarSlide({ slide }) {
  const [imgOk, setImgOk] = useState(true);

  return (
    <div style={s.carSlide}>
      {/* Immagine */}
      <div style={s.imgBox}>
        {slide.immagine && imgOk ? (
          <img
            src={slide.immagine}
            alt={slide.titolo}
            style={s.carImg}
            onError={() => setImgOk(false)}
          />
        ) : (
          <div style={s.noPhoto}>FOTO<br />NON<br />DISPONIBILE</div>
        )}
      </div>

      {/* Info */}
      <div style={s.infoBox}>
        <h2 style={s.carTitle}>{slide.titolo}</h2>

        <div style={s.tagsRow}>
          {slide.anno        && <Tag label="ANNO"          value={slide.anno} />}
          {slide.km          && <Tag label="KM"            value={formatKm(slide.km)} />}
          {slide.alimentazione && <Tag label="CARBURANTE"  value={slide.alimentazione} />}
          {slide.cambio      && <Tag label="CAMBIO"        value={slide.cambio} />}
        </div>

        {slide.prezzo && (
          <div style={s.priceBox}>
            <span style={s.priceText}>{slide.prezzo}</span>
          </div>
        )}

        {slide.link && (
          <div style={s.qrRow}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(slide.link)}`}
              alt="QR"
              style={s.qr}
            />
            <span style={s.qrLabel}>Scansiona per i dettagli</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PromoSlide({ slide }) {
  return (
    <div style={s.promoSlide}>
      <img src={slide.immagine} alt="Promozione" style={s.promoImg} />
    </div>
  );
}

function Tag({ label, value }) {
  return (
    <div style={s.tag}>
      <span style={s.tagLabel}>{label}</span>
      <span style={s.tagValue}>{value}</span>
    </div>
  );
}

function FullScreen({ children }) {
  return <div style={{ ...s.root, alignItems: "center", justifyContent: "center" }}>{children}</div>;
}

function Spinner() {
  return <p style={{ color: "#FFD700", fontFamily: "'Rubik Mono One'", fontSize: "2rem" }}>CARICAMENTO...</p>;
}

function ErrorMsg({ msg }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ color: "#FF00FF", fontFamily: "'Rubik Mono One'", fontSize: "1.5rem" }}>ERRORE</p>
      <p style={{ color: "#aaa", marginTop: "1rem" }}>{msg}</p>
    </div>
  );
}

// ── Utility ────────────────────────────────────────────────────────────────
function formatKm(km) {
  if (!km) return "";
  const num = parseInt(km.toString().replace(/\D/g, ""), 10);
  if (isNaN(num)) return km;
  return num === 0 ? "0 km" : `${num.toLocaleString("it-IT")} km`;
}

// ── Stili inline ───────────────────────────────────────────────────────────
const s = {
  root: {
    width: "100vw", height: "100vh",
    display: "flex", flexDirection: "column",
    background: "#111", overflow: "hidden",
  },
  topBar: {
    flexShrink: 0, height: "68px",
    background: "#FFD700", borderBottom: "4px solid #111",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 2.5rem",
  },
  brandTitle: {
    fontFamily: "'Rubik Mono One', monospace",
    fontSize: "1.4rem", color: "#111",
    transform: "rotate(-1deg)", display: "inline-block",
  },
  brandSub: {
    fontFamily: "'Rubik Mono One', monospace",
    fontSize: "0.85rem", color: "#111",
  },
  slideArea: { flex: 1, overflow: "hidden", position: "relative" },
  progressTrack: { flexShrink: 0, height: "6px", background: "#2a2a2a" },
  progressFill: { height: "100%", background: "#FFD700", transition: "width 0.05s linear" },
  bottomBar: {
    flexShrink: 0, height: "52px",
    background: "#111", borderTop: "4px solid #FFD700",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 2.5rem",
  },
  locations: { display: "flex", gap: "2.5rem" },
  locText: { color: "#888", fontSize: "0.78rem" },
  phone: {
    fontFamily: "'Rubik Mono One', monospace",
    fontSize: "1.15rem", color: "#FFD700",
  },
  // Car slide
  carSlide: {
    width: "100%", height: "100%",
    display: "flex", background: "#181818",
  },
  imgBox: {
    flex: "0 0 58%", display: "flex",
    alignItems: "center", justifyContent: "center",
    padding: "2rem", borderRight: "4px solid #FFD700",
    overflow: "hidden",
  },
  carImg: {
    maxWidth: "100%", maxHeight: "100%",
    objectFit: "contain",
    boxShadow: "10px 10px 0 #FFD700",
  },
  noPhoto: {
    fontFamily: "'Rubik Mono One', monospace",
    fontSize: "2.5rem", color: "#333",
    lineHeight: 1.3, textAlign: "center",
  },
  infoBox: {
    flex: 1, display: "flex", flexDirection: "column",
    justifyContent: "center", padding: "2.5rem 2rem",
    gap: "1.2rem", overflow: "hidden",
  },
  carTitle: {
    fontFamily: "'Rubik Mono One', monospace",
    fontSize: "clamp(1rem, 2.2vw, 2rem)",
    color: "#fff", lineHeight: 1.25, textTransform: "uppercase",
  },
  tagsRow: { display: "flex", flexWrap: "wrap", gap: "0.6rem" },
  tag: {
    border: "2px solid #FFD700",
    padding: "0.25rem 0.7rem",
    display: "flex", flexDirection: "column",
  },
  tagLabel: { color: "#FFD700", fontSize: "0.6rem", textTransform: "uppercase" },
  tagValue: { color: "#fff", fontWeight: "700", fontSize: "0.85rem" },
  priceBox: {
    background: "#FFD700", border: "4px solid #111",
    padding: "0.8rem 1.2rem", display: "inline-block",
    transform: "rotate(-1deg)",
    boxShadow: "6px 6px 0 rgba(0,0,0,0.5)",
    alignSelf: "flex-start",
  },
  priceText: {
    fontFamily: "'Rubik Mono One', monospace",
    fontSize: "clamp(1.3rem, 2.8vw, 2.5rem)",
    color: "#111",
  },
  qrRow: { display: "flex", alignItems: "center", gap: "0.8rem" },
  qr: { border: "3px solid #FFD700", padding: "3px", background: "#fff" },
  qrLabel: { color: "#666", fontSize: "0.72rem" },
  // Promo slide
  promoSlide: {
    width: "100%", height: "100%",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "#000",
  },
  promoImg: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
};
```

**Step 3: Aggiornare `App.jsx`**

```jsx
// frontend/src/App.jsx
import Showroom from "./Showroom";
export default function App() { return <Showroom />; }
```

**Step 4: Build e test visivo**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento/frontend
npm run build

# Aprire con server HTTP (altra finestra)
cd ..
python -m http.server 8090
```

Aprire `http://localhost:8090/` nel browser.

Verificare:
- [ ] Le auto ruotano automaticamente
- [ ] Prezzo visibile in gold con bordo
- [ ] Barra di progresso avanza
- [ ] Tag Anno / KM / Carburante / Cambio visibili
- [ ] QR code generato
- [ ] Placeholder "FOTO NON DISPONIBILE" se immagine mancante
- [ ] Le slide promo appaiono ogni 4 auto
- [ ] Top bar e bottom bar sempre visibili
- [ ] Testo non va fuori dagli elementi

**Step 5: Commit**

```bash
git add frontend/ assets/ index.html
git commit -m "feat: frontend React kiosk con design neon gold e tutti i campi"
```

---

## Fase 3 — Test integrazione end-to-end

### Task 6: Scraping reale + verifica qualità + push GitHub

**Step 1: Avviare il CMS e fare uno scraping reale**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento/NEWSECTION
python -m streamlit run app.py
```

- Tab "Scraping" → avvia scraping completo
- Verificare il log: devono apparire le 3 sezioni (km0, usato, outlet) e i totali

**Step 2: Controllo qualità dati**

```bash
python -c "
import json, sys
sys.path.insert(0, '.')
data = json.load(open('../stock.json', encoding='utf-8'))
print(f'Totale annunci: {len(data)}')
fields = ['titolo', 'prezzo', 'anno', 'km', 'alimentazione', 'cambio', 'link', 'immagine']
for f in fields:
    empty = sum(1 for d in data if not d.get(f))
    pct = empty / len(data) * 100
    print(f'  {f}: {empty} vuoti ({pct:.0f}%)')
print()
print('Esempio annuncio:')
print(json.dumps(data[0], ensure_ascii=False, indent=2))
"
```

Soglie accettabili:
- `titolo`, `prezzo`, `link`: 0% vuoti
- `immagine`: < 20% vuoti (alcune auto non hanno foto)
- `anno`, `km`: < 5% vuoti
- `alimentazione`, `cambio`: < 10% vuoti

Se le soglie non sono rispettate, tornare a Task 2 e debug dei selettori.

**Step 3: Test frontend con dati reali**

```bash
cd /c/Users/Williams/Documents/GitHub/autocaricamento
python -m http.server 8090
```

Aprire `http://localhost:8090/` e lasciare girare almeno 5-6 slide per verificare l'aspetto visivo con dati veri.

**Step 4: Push su GitHub**

Dal CMS (tab "GitHub") → inserire credenziali se non salvate → Push.

Verificare online che `stock.json` sia aggiornato nel repo.

**Step 5: Commit finale e aggiornamento CLAUDE.md**

Aggiornare `CLAUDE.md` con URL GitHub Pages del frontend e workflow definitivo.

```bash
git add .
git commit -m "docs: completamento sistema kiosk v2 con nuovo scraper e frontend React"
```

---

## Dipendenze richieste

**Python (NEWSECTION):**
```bash
pip install requests beautifulsoup4 streamlit PyGithub
```

**Node (frontend):**
```bash
cd frontend && npm install
```
