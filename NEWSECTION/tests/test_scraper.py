# NEWSECTION/tests/test_scraper.py
"""
Test del parser scraper per rotoloautomobili.com.
Usa fixture HTML reali scaricate in NEWSECTION/tests/fixtures/.
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
        for fixture in ["km0_page1.html", "usato_page1.html", "outlet_page1.html"]:
            html = (FIXTURES / fixture).read_text(encoding="utf-8")
            listings = parse_listings_from_html(html, BASE)
            links = [l["link"] for l in listings]
            assert len(links) == len(set(links)), f"{fixture}: link duplicati: {links}"


# ── Campi obbligatori ─────────────────────────────────────────────────────────

class TestCampiObbligatori:
    REQUIRED = {"titolo", "prezzo", "link", "anno", "km", "alimentazione", "cambio", "immagine"}

    def _check_section(self, fixture_name):
        html = (FIXTURES / fixture_name).read_text(encoding="utf-8")
        listings = parse_listings_from_html(html, BASE)
        assert listings, f"{fixture_name}: lista vuota"
        for i, l in enumerate(listings):
            missing_keys = set(self.REQUIRED) - set(l.keys())
            assert not missing_keys, f"{fixture_name}[{i}] manca chiavi: {missing_keys}\ndati: {l}"

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
        """Se il sito usa no_photo_default.jpg, immagine deve essere stringa vuota."""
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
                    assert any(c.isdigit() for c in str(km)), f"km non numerico: {km!r}"

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

    def test_pagina_2_ha_annunci_se_esiste(self):
        """Se la pagina 2 esiste come fixture con link, deve restituire annunci."""
        f = FIXTURES / "usato_page2.html"
        if f.exists():
            html = f.read_text(encoding="utf-8")
            import re
            links = re.findall(r'href="/auto/', html)
            if links:  # solo se ha realmente link auto
                listings = parse_listings_from_html(html, BASE)
                assert len(listings) > 0, "usato page2: nessun annuncio"
