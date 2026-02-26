"""
scraper.py — Parser per rotoloautomobili.com
Estrae annunci dalle sezioni km0, usato e outlet.
"""
from __future__ import annotations

import random
import re
import time
from typing import Callable

import requests
from bs4 import BeautifulSoup

# ── Configurazione ────────────────────────────────────────────────────────────

BASE_URL = "https://www.rotoloautomobili.com"

SECTIONS: dict[str, dict] = {
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

# ── Parsing ───────────────────────────────────────────────────────────────────

def parse_listings_from_html(html: str, base_url: str = BASE_URL) -> list[dict]:
    """
    Trova tutti i tag <a class="item" href="/auto/..."> e li parsa.
    Restituisce una lista di dict con i dati dell'annuncio.
    """
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.find_all("a", class_="item", href=re.compile(r"^/auto/"))
    results = []
    seen_links = set()
    for card in cards:
        listing = _parse_card(card, base_url)
        if listing is None:
            continue
        link = listing["link"]
        if link in seen_links:
            continue
        seen_links.add(link)
        results.append(listing)
    return results


def _parse_card(a_tag, base_url: str = BASE_URL) -> dict | None:
    """
    Estrae i campi da un singolo tag <a class="item" href="/auto/...">.
    Restituisce None se il tag non è un annuncio valido.
    """
    href = a_tag.get("href", "")
    if not href.startswith("/auto/"):
        return None

    link = base_url.rstrip("/") + href

    # ── Anno e tipo (km0 / usato / outlet) ───────────────────────────────────
    anno = ""
    tipo = ""
    info_div = a_tag.find("div", class_="info")
    if info_div:
        spans = info_div.find_all("span")
        if len(spans) >= 1:
            tipo = spans[0].get_text(strip=True)
        if len(spans) >= 2:
            anno = spans[1].get_text(strip=True)

    # ── Immagine ──────────────────────────────────────────────────────────────
    # Cerca tutte le img nel card, escludendo il logo marca (loghiqr.ibi.it)
    # e il placeholder no_photo_default.jpg
    immagine = ""
    image_div = a_tag.find("div", class_="image")
    if image_div:
        for img in image_div.find_all("img"):
            src = img.get("src", "")
            if not src:
                continue
            if "loghiqr.ibi.it" in src:
                continue
            if "no_photo_default" in src:
                continue
            # Preferenza alle URL S3/amazonaws
            if src.startswith("http"):
                immagine = src
                break
            # Immagine relativa (meno probabile per S3)
            immagine = base_url.rstrip("/") + src
            break

    # ── Titolo: MARCA + modello base + variante ───────────────────────────────
    marca = ""
    modello_base = ""
    variante = ""

    section1 = a_tag.find("div", class_="section1")
    if section1:
        t1 = section1.find("div", class_="t1")
        if t1:
            # <b>MARCA</b> Modello base
            b_tag = t1.find("b")
            if b_tag:
                marca = b_tag.get_text(strip=True)
                # Il testo dopo il <b> è il modello base
                # Usa get_text su t1 e rimuovi la marca dal prefisso
                full_t1 = t1.get_text(" ", strip=True)
                modello_base = full_t1[len(marca):].strip()
            else:
                full_t1 = t1.get_text(" ", strip=True)
                modello_base = full_t1

        t2 = section1.find("div", class_="t2")
        if t2:
            variante = t2.get_text(" ", strip=True)

    if marca and modello_base and variante:
        titolo = f"{marca} {modello_base} {variante}".strip()
    elif marca and modello_base:
        titolo = f"{marca} {modello_base}".strip()
    elif marca and variante:
        titolo = f"{marca} {variante}".strip()
    else:
        titolo = (marca or modello_base or variante).strip()

    if not titolo:
        return None

    # ── Km ────────────────────────────────────────────────────────────────────
    km = ""
    section2 = a_tag.find("div", class_="section2")
    if section2:
        t1_s2 = section2.find("div", class_="t1")
        if t1_s2:
            # "<b>Km</b> 203.000" → "203000" (solo cifre)
            full_text = t1_s2.get_text(" ", strip=True)
            # Rimuovi "Km" dal prefisso
            km_text = re.sub(r"^[Kk]m\s*", "", full_text).strip()
            # Rimuovi punti separatori migliaia
            km = re.sub(r"[^\d]", "", km_text)

    # ── Alimentazione e Cambio ────────────────────────────────────────────────
    alimentazione = ""
    cambio = ""
    if section2:
        for t2_div in section2.find_all("div", class_="t2"):
            spans = t2_div.find_all("span")
            if len(spans) >= 2:
                label = spans[0].get_text(strip=True).lower()
                value = spans[1].get_text(strip=True)
                if "alimentazione" in label:
                    alimentazione = value
                elif "cambio" in label:
                    cambio = value

    # ── Prezzo ───────────────────────────────────────────────────────────────
    prezzo = ""
    section3 = a_tag.find("div", class_="section3")
    if section3:
        prezzo_div = section3.find("div", class_="prezzo")
        if prezzo_div:
            prezzo = prezzo_div.get_text(strip=True)

    if not prezzo:
        return None

    return {
        "titolo": titolo,
        "prezzo": prezzo,
        "anno": anno,
        "km": km,
        "alimentazione": alimentazione,
        "cambio": cambio,
        "link": link,
        "immagine": immagine,
        "tipo": tipo,
    }


# ── Paginazione ───────────────────────────────────────────────────────────────

def has_next_page(html: str, current_page: int) -> bool:
    """
    Controlla se nella paginazione esiste un link per la pagina current_page+1.
    """
    next_page = current_page + 1
    soup = BeautifulSoup(html, "html.parser")
    # Cerca tutti i link paginazione con class cta_pageitem
    pag_div = soup.find("div", class_="paginazione")
    if not pag_div:
        return False
    pattern = re.compile(rf"[?&]Page={next_page}(?:&|$|%)")
    for a in pag_div.find_all("a", class_="cta_pageitem"):
        href = a.get("href", "")
        # Cerca Page=N nei parametri URL (decodificati o encodati)
        if re.search(rf"[?&]Page={next_page}(?:[&%#]|$)", href):
            return True
    return False


# ── Scraping ──────────────────────────────────────────────────────────────────

def scrape_section(
    section_name: str,
    log_fn: Callable = print,
    delay: float = 1.5,
) -> list[dict]:
    """
    Scrapa tutte le pagine di una sezione (km0, usato, outlet).
    Usa 2 pagine vuote consecutive prima di fermarsi.
    """
    config = SECTIONS[section_name]
    url = config["url"]
    page_params_fn = config["page_params"]

    all_listings: list[dict] = []
    seen_links: set[str] = set()
    page = 1
    empty_count = 0
    MAX_EMPTY = 2

    while True:
        params = page_params_fn(page)
        log_fn(f"[{section_name}] Pagina {page}...")
        try:
            resp = requests.get(url, params=params, timeout=15, headers={
                "User-Agent": "Mozilla/5.0 (compatible; AutoScraper/1.0)"
            })
            resp.raise_for_status()
            html = resp.text
        except Exception as e:
            log_fn(f"[{section_name}] Errore pagina {page}: {e}")
            empty_count += 1
            if empty_count >= MAX_EMPTY:
                break
            page += 1
            time.sleep(delay + random.uniform(0, 0.5))
            continue

        listings = parse_listings_from_html(html, BASE_URL)
        new_listings = [l for l in listings if l["link"] not in seen_links]

        if not new_listings:
            empty_count += 1
            log_fn(f"[{section_name}] Pagina {page} vuota (count={empty_count})")
            if empty_count >= MAX_EMPTY:
                break
        else:
            empty_count = 0
            for l in new_listings:
                seen_links.add(l["link"])
                all_listings.append(l)
            log_fn(f"[{section_name}] Pagina {page}: {len(new_listings)} annunci trovati")

        if not has_next_page(html, page):
            log_fn(f"[{section_name}] Nessuna pagina successiva dopo pagina {page}. Fine.")
            break

        page += 1
        time.sleep(delay + random.uniform(0, 0.5))

    return all_listings


def run_scraper(log_fn: Callable = print) -> list[dict]:
    """
    Scrapa tutte e 3 le sezioni, deduplica per link, mescola e assegna posizioni.
    """
    all_listings: list[dict] = []
    seen_links: set[str] = set()

    for section_name in SECTIONS:
        log_fn(f"\n=== Sezione: {section_name} ===")
        listings = scrape_section(section_name, log_fn=log_fn)
        for l in listings:
            if l["link"] not in seen_links:
                seen_links.add(l["link"])
                all_listings.append(l)
        log_fn(f"=== {section_name}: {len(listings)} annunci totali ===")

    random.shuffle(all_listings)
    for i, l in enumerate(all_listings, start=1):
        l["posizione"] = i

    log_fn(f"\nTotale annunci: {len(all_listings)}")
    return all_listings


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    results = run_scraper()
    for r in results[:3]:
        print(r)
