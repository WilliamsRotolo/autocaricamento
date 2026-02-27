import streamlit as st
import json
import math
from datetime import datetime
import os
from bs4 import Tag
from github import Github, Auth, GithubException
import re

from scraper import run_scraper

# =========================
# CONFIG
# =========================
st.set_page_config(page_title="CMS Annunci Auto", layout="wide")

DATA_DIR = "data"
STOCK_FILE = os.path.join(DATA_DIR, "stock.json")
SETTINGS_FILE = "settings.json"
SECRETS_FILE = "secrets.json"
PROMO_DIR = os.path.join("static", "promos")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PROMO_DIR, exist_ok=True)

# Inizializza la session state per il log
if 'log' not in st.session_state:
    st.session_state.log = []
if 'scraping_log' not in st.session_state:
    st.session_state.scraping_log = ""
if 'scraping_in_progress' not in st.session_state:
    st.session_state.scraping_in_progress = False
if 'editor_changed' not in st.session_state:
    st.session_state.editor_changed = False


# =========================
# UTILS
# =========================
def load_json(path, default):
    """Carica JSON in modo robusto. Se mancante/corrotto, ritorna default."""
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, ValueError):
            return default
    return default


def save_json(path, data):
    """Salva l'intero JSON (indentato, utf-8)."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def pos_key(item):
    """Chiave di ordinamento: posizione numerica (se valida), tie-breaker = link."""
    raw = item.get("posizione", None)
    try:
        p = int(raw)
    except (TypeError, ValueError):
        p = 10_000_000
    return (p, item.get("link", ""))


def sorted_annunci(annunci):
    """Ritorna una copia della lista di annunci ordinata."""
    return sorted(annunci, key=pos_key)


def check_for_conflicts(annunci_list):
    """Controlla se ci sono posizioni duplicate nella lista degli annunci."""
    positions = [item.get("posizione") for item in annunci_list if "posizione" in item]
    if not positions:
        return False
    return len(positions) != len(set(positions))


def resolve_conflicts_and_save():
    """Risolve i conflitti di posizione riassegnando numeri sequenziali."""
    full_list = load_json(STOCK_FILE, [])
    if not isinstance(full_list, list):
        full_list = []
    
    st.session_state.log = []
    st.session_state.log.append("⚠️ **Conflitto rilevato.** Risoluzione automatica avviata.")
    
    full_list.sort(key=pos_key)

    for i, item in enumerate(full_list):
        nuova_pos = i + 1
        st.session_state.log.append(f"→ Riassegnata posizione a '{item.get('titolo', 'N/D')}': da {item.get('posizione')} a {nuova_pos}")
        item["posizione"] = nuova_pos
    
    save_json(STOCK_FILE, full_list)
    st.success("✅ Conflitti risolti. Lista salvata e riordinata.")
    st.rerun()


def set_editor_changed():
    """Imposta lo stato per indicare che l'editor è stato modificato."""
    st.session_state.editor_changed = True


def save_changes_and_reorganize():
    """Salva le modifiche e riorganizza la lista degli annunci."""
    st.session_state.log = []

    full_list = load_json(STOCK_FILE, [])
    if not isinstance(full_list, list):
        full_list = []
    
    # Aggiorna i valori
    for item in full_list:
        unique_key = item.get("link")
        if unique_key:
            try:
                item["titolo"] = st.session_state[f"titolo_{unique_key}"]
                item["prezzo"] = st.session_state[f"prezzo_{unique_key}"]
                item["anno"] = st.session_state[f"anno_{unique_key}"]
                item["km"] = st.session_state[f"km_{unique_key}"]
                item["posizione"] = st.session_state[f"pos_{unique_key}"]
            except KeyError:
                continue

    # Ordina e riassegna posizioni pulite
    full_list.sort(key=pos_key)
    for i, item in enumerate(full_list):
        item["posizione"] = i + 1

    save_json(STOCK_FILE, full_list)
    st.session_state.log.append("✅ Modifiche salvate e lista riorganizzata.")
    st.session_state.editor_changed = False
    st.rerun()


# =========================
# FUNZIONI IMMAGINI (fix)
# =========================
def extract_url_from_srcset(srcset_value: str) -> str:
    """Estrae il primo URL utile da un attributo srcset."""
    if not srcset_value:
        return ""
    parts = [p.strip() for p in srcset_value.split(",") if p.strip()]
    if not parts:
        return ""
    first = parts[0]
    return first.split()[0].strip()


def normalize_img_candidate(candidate) -> str:
    """
    Accetta stringa o Tag <img>.
    Restituisce URL completo e valido (startswith http) o "".
    """
    url = ""
    if isinstance(candidate, Tag):
        for attr in ("src", "data-src", "data-lazy", "data-original", "data-srcset", "srcset"):
            val = candidate.get(attr)
            if not val:
                continue
            if attr in ("srcset", "data-srcset"):
                val = extract_url_from_srcset(val)
            if val:
                url = val.strip()
                break
    else:
        if candidate:
            url = str(candidate).strip()

    if not url or url.lower() in ("https:", "http:"):
        return ""
    if url.startswith("//"):
        url = "https:" + url
    if url.startswith("/"):
        url = "https://www.rotoloauto.com" + url
    if not re.match(r"^https?://", url):
        return ""
    return url


# =========================
# GITHUB UPLOAD
# =========================
def push_to_github(username, repo_name, token, file_entries):
    """
    file_entries: lista di tuple (local_path, github_path).
    Supporta file binari (immagini) e testuali.
    """
    try:
        g = Github(auth=Auth.Token(token))
        user = g.get_user(username)
        repo = user.get_repo(repo_name)

        for local_path, github_path in file_entries:
            with open(local_path, "rb") as f:
                content = f.read()
            label = os.path.basename(github_path)
            try:
                existing = repo.get_contents(github_path)
                repo.update_file(github_path, f"Aggiornamento {label}", content, existing.sha)
            except GithubException as e:
                if e.status == 404:
                    repo.create_file(github_path, f"Creazione {label}", content)
                else:
                    st.session_state.log.append(f"🔴 Errore push {github_path}: {e.data['message']}")
                    return False
            st.session_state.log.append(f"✅ Caricato '{github_path}' su '{repo_name}'")

        return True

    except GithubException as e:
        st.session_state.log.append(f"🔴 Errore GitHub: {e.data['message']}")
        return False
    except Exception as e:
        st.session_state.log.append(f"🔴 Errore generico: {e}")
        return False


# =========================
# LOAD INIZIALE
# =========================
annunci = load_json(STOCK_FILE, [])
settings = load_json(SETTINGS_FILE, {
    "durata_slide": 8,
    "max_annunci": 20,
    "ordine": "Casuale",
    "promo": []
})
secrets = load_json(SECRETS_FILE, {})

now_it = datetime.now().strftime("%d/%m/%Y - %H:%M:%S")
st.title("🚗 CMS Annunci Auto")

tabs = st.tabs(["📊 Dashboard", "🕵️ Scraping", "✏️ Editor annunci", "🎛️ Settings slideshow", "⬆️ GitHub"])


# =========================
# DASHBOARD
# =========================
with tabs[0]:
    st.header("📊 Dashboard")

    cols = st.columns([1, 1, 2])
    with cols[0]:
        if st.button("🔄 Aggiorna lista", key="refresh_dashboard"):
            st.rerun()
    with cols[1]:
        st.metric("Annunci totali", len(annunci))
    with cols[2]:
        st.caption(f"🕒 Ultimo refresh: {now_it}")

    st.subheader("📋 Lista annunci")

    if annunci:
        ordered = sorted_annunci(annunci)
        per_page = 20
        num_pages = max(1, math.ceil(len(ordered) / per_page))
        page = st.number_input("Pagina", min_value=1, max_value=num_pages, value=1, key="page_dashboard")

        start, end = (page - 1) * per_page, (page - 1) * per_page + per_page

        for a in ordered[start:end]:
            col1, col2 = st.columns([1, 3])
            with col1:
                img_url = normalize_img_candidate(a.get("immagine", ""))
                if img_url:
                    try:
                        st.image(img_url, width=120)
                    except Exception:
                        st.write("⚠️ Immagine non caricabile")
            with col2:
                st.write(f"**#{a.get('posizione', '-')} — {a.get('titolo', '')}**")
                st.write(f"💰 {a.get('prezzo', '')} | 📅 {a.get('anno', '')} | 🚗 {a.get('km', '')}")
                link = a.get("link", "")
                if link:
                    st.write(f"[🔗 Vai all'annuncio]({link})")
    else:
        st.info("Nessun annuncio disponibile.")


# =========================
# SCRAPING
# =========================
with tabs[1]:
    st.header("🕵️ Scraping")

    if st.session_state.scraping_in_progress:
        st.info("Scraping in corso...")
        log_lines = []
        risultati = run_scraper(log_fn=lambda msg: log_lines.append(str(msg)))
        save_json(STOCK_FILE, risultati)
        log_lines.append(f"Salvato: {STOCK_FILE}")
        st.session_state.scraping_log = "\n".join(log_lines)
        st.session_state.scraping_in_progress = False
    else:
        if st.button("▶️ Avvia scraping"):
            st.session_state.scraping_in_progress = True
            st.rerun()

    st.text_area("Log scraping", st.session_state.scraping_log, height=400)


# =========================
# EDITOR ANNUNCI
# =========================
with tabs[2]:
    st.header("✏️ Editor annunci")

    top_cols = st.columns([1, 2, 2])
    with top_cols[0]:
        if st.button("🔄 Aggiorna lista editor", key="refresh_editor_top"):
            st.rerun()
    with top_cols[2]:
        st.caption(f"🕒 Ultimo refresh editor: {now_it}")

    if check_for_conflicts(annunci):
        with st.expander("🚨 CONFLITTO DI POSIZIONE 🚨", expanded=True):
            st.warning("Sono state rilevate posizioni duplicate.")
            if st.button("Risolvi automaticamente"):
                resolve_conflicts_and_save()

    if annunci:
        ordered = sorted_annunci(annunci)
        per_page = 20
        num_pages = max(1, math.ceil(len(ordered) / per_page))
        page = st.number_input("Pagina editor", min_value=1, max_value=num_pages, value=1, key="editor_page")

        start, end = (page - 1) * per_page, (page - 1) * per_page + per_page
        page_slice = ordered[start:end]

        for a in page_slice:
            st.markdown("---")
            colA, colB = st.columns([1, 3])
            with colA:
                img_url = normalize_img_candidate(a.get("immagine", ""))
                if img_url:
                    try:
                        st.image(img_url, width=120)
                    except Exception:
                        st.write("⚠️ Immagine non caricabile")
            with colB:
                unique_key = a.get("link", "")
                if unique_key:
                    st.text_input("Titolo", a.get("titolo", ""), key=f"titolo_{unique_key}", on_change=set_editor_changed)
                    st.text_input("Prezzo", a.get("prezzo", ""), key=f"prezzo_{unique_key}", on_change=set_editor_changed)
                    st.text_input("Anno", a.get("anno", ""), key=f"anno_{unique_key}", on_change=set_editor_changed)
                    st.text_input("Km", a.get("km", ""), key=f"km_{unique_key}", on_change=set_editor_changed)
                    st.number_input("Posizione", 1, len(annunci), int(a.get("posizione", 1)), key=f"pos_{unique_key}", on_change=set_editor_changed)

        st.markdown("---")
        bottom_cols = st.columns([1, 2, 2])
        with bottom_cols[0]:
            if st.session_state.editor_changed and st.button("💾 Salva modifiche"):
                save_changes_and_reorganize()
        with bottom_cols[1]:
            if st.button("🔄 Aggiorna lista editor", key="refresh_editor_bottom"):
                st.rerun()
        with bottom_cols[2]:
            st.caption(f"🕒 Ultimo refresh: {now_it}")

    if 'log' in st.session_state:
        st.markdown("---")
        st.markdown("### 📝 Log di debug")
        for entry in st.session_state.log:
            st.write(entry if isinstance(entry, str) else json.dumps(entry, indent=2))


# =========================
# SETTINGS SLIDESHOW
# =========================
with tabs[3]:
    st.header("🎛️ Settings slideshow")

    settings["durata_slide"] = st.slider("Durata slide (sec)", 3, 20, settings.get("durata_slide", 8))
    settings["max_annunci"] = st.slider("Numero massimo annunci", 5, 100, settings.get("max_annunci", 20))
    settings["ordine"] = st.selectbox("Ordine", ["Casuale", "Posizione"], index=["Casuale", "Posizione"].index(settings.get("ordine", "Casuale")))

    save_json(SETTINGS_FILE, settings)
    st.success("✅ Impostazioni slideshow salvate automaticamente.")

    st.divider()
    st.subheader("🖼️ Immagini promo")
    st.caption("Le immagini promo vengono mostrate ogni 4 auto nel carosello.")

    current_promos = settings.get("promo", [])
    if current_promos:
        for i, promo_github_path in enumerate(current_promos):
            local_path = os.path.join(PROMO_DIR, os.path.basename(promo_github_path))
            col1, col2, col3 = st.columns([1, 4, 1])
            with col1:
                if os.path.exists(local_path):
                    st.image(local_path, width=100)
                else:
                    st.write("⚠️ file locale assente")
            with col2:
                st.write(f"`{promo_github_path}`")
            with col3:
                if st.button("❌ Rimuovi", key=f"del_promo_{i}"):
                    settings["promo"].pop(i)
                    save_json(SETTINGS_FILE, settings)
                    st.rerun()
    else:
        st.info("Nessuna immagine promo configurata.")

    st.write("**Aggiungi nuova immagine promo:**")
    uploaded = st.file_uploader(
        "Scegli un'immagine (PNG, JPG, WEBP)",
        type=["png", "jpg", "jpeg", "webp"],
        key="promo_upload",
    )
    if uploaded is not None:
        os.makedirs(PROMO_DIR, exist_ok=True)
        save_path = os.path.join(PROMO_DIR, uploaded.name)
        with open(save_path, "wb") as f:
            f.write(uploaded.getbuffer())
        github_path = f"static/promos/{uploaded.name}"
        if github_path not in settings.get("promo", []):
            settings.setdefault("promo", []).append(github_path)
            save_json(SETTINGS_FILE, settings)
        st.success(f"✅ '{uploaded.name}' salvata. Ricordati di fare l'upload su GitHub.")
        st.rerun()


# =========================
# GITHUB
# =========================
with tabs[4]:
    st.header("⬆️ Upload su GitHub")

    username = st.text_input("Username", secrets.get("github_user", ""))
    repo     = st.text_input("Repository", secrets.get("github_repo", ""))
    token    = st.text_input("Token", secrets.get("github_token", ""), type="password")

    if st.button("💾 Salva credenziali in locale"):
        secrets["github_user"]  = username
        secrets["github_repo"]  = repo
        secrets["github_token"] = token
        save_json(SECRETS_FILE, secrets)
        st.success("✅ Credenziali salvate in secrets.json (solo locale, non su Git).")

    st.divider()
    # Mostra sempre cosa verrà pushato
    promo_files = [
        (os.path.join(PROMO_DIR, os.path.basename(p)), p)
        for p in settings.get("promo", [])
        if os.path.exists(os.path.join(PROMO_DIR, os.path.basename(p)))
    ]
    st.write(f"**File da caricare:** `stock.json`, `settings.json`"
             + (f" + {len(promo_files)} immagini promo" if promo_files else ""))

    if st.button("🚀 Carica su GitHub"):
        file_entries = [
            (STOCK_FILE, "stock.json"),
            (SETTINGS_FILE, "settings.json"),
        ] + promo_files
        success = push_to_github(username, repo, token, file_entries)
        if success:
            st.success("✅ Upload completato con successo.")
        else:
            st.error("❌ Errore durante l’upload.")

