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

    def test_pagine_intermedie_hanno_annunci(self):
        """Pagine 2-5 devono avere annunci (struttura HTML uniforme su tutte le pagine)."""
        for page_n in [2, 3, 4, 5]:
            f = FIXTURES / f"usato_page{page_n}.html"
            if not f.exists():
                continue
            html = f.read_text(encoding="utf-8")
            listings = parse_listings_from_html(html, BASE)
            assert len(listings) > 0, f"usato page{page_n}: nessun annuncio (struttura cambiata?)"

    def test_has_next_true_per_pagine_intermedie(self):
        """Pagine 1-5 devono segnalare pagina successiva disponibile."""
        for page_n in [1, 2, 3, 4, 5]:
            f = FIXTURES / f"usato_page{page_n}.html"
            if not f.exists():
                continue
            html = f.read_text(encoding="utf-8")
            result = has_next_page(html, current_page=page_n)
            assert result is True, (
                f"usato page{page_n}: has_next_page={result}, atteso True "
                f"(scraper si fermerebbe prematuramente!)"
            )

    def test_has_next_false_per_ultima_pagina(self):
        """L'ultima pagina NON deve segnalare pagina successiva."""
        f = FIXTURES / "usato_page9.html"
        if not f.exists():
            pytest.skip("fixture usato_page9.html non presente")
        html = f.read_text(encoding="utf-8")
        result = has_next_page(html, current_page=9)
        assert result is False, (
            f"usato page9 (ultima): has_next_page={result}, atteso False "
            f"(scraper non si fermerebbe mai!)"
        )

    def test_ultima_pagina_ha_annunci(self):
        """Anche l'ultima pagina deve avere annunci."""
        f = FIXTURES / "usato_page9.html"
        if not f.exists():
            pytest.skip("fixture usato_page9.html non presente")
        html = f.read_text(encoding="utf-8")
        listings = parse_listings_from_html(html, BASE)
        assert len(listings) > 0, "usato page9: nessun annuncio"

    def test_campi_obbligatori_pagine_successive(self):
        """I campi obbligatori devono essere presenti anche nelle pagine 3-5 e 9."""
        REQUIRED = {"titolo", "prezzo", "link", "anno", "km", "alimentazione", "cambio", "immagine"}
        for page_n in [3, 4, 5, 9]:
            f = FIXTURES / f"usato_page{page_n}.html"
            if not f.exists():
                continue
            html = f.read_text(encoding="utf-8")
            listings = parse_listings_from_html(html, BASE)
            for i, l in enumerate(listings):
                missing = REQUIRED - set(l.keys())
                assert not missing, (
                    f"usato_page{page_n}[{i}] manca chiavi: {missing}"
                )
