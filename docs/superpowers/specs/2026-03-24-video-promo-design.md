# Video Promozionale nel Kiosk — Design Spec

**Data:** 2026-03-24
**Progetto:** Rotolo Auto — Kiosk Slideshow
**File target:** `frontend/src/Showroom.jsx`

---

## Obiettivo

Aggiungere supporto a video promozionali nella rotazione slide del kiosk, mantenendo il design neon-gold esistente e senza modificare lo schema di settings.json o stock.json.

---

## Decisioni di design

| Aspetto | Decisione |
|---|---|
| Integrazione | Path video nell'array `promo` di settings.json — zero modifiche allo schema |
| Rilevamento | Auto-detect per estensione: `.mp4`, `.webm`, `.ogg` (no `.mov` — non supportato su Chrome/Firefox/Edge) |
| Durata | Entrambi i timer sospesi durante il video — avanza quando `onEnded` scatta |
| Audio | Sempre muto (`muted`) |
| Video verticale | Centrato con sfondo gaussian blur ai lati (due `<video>`, desync decorativo accettabile) |
| Layout slide video | Video (flex 2/3 sinistra) + mini-lista fino a 3 auto (flex 1/3 destra), statica |
| Mini-card contenuto | Foto + titolo (ellipsis) + prezzo gold su dark — snapshot al momento del render |

---

## Come si usa

```json
{
  "promo": [
    "static/promos/offerta-estate.jpg",
    "static/promos/video-promo.mp4",
    "static/promos/natale.jpg"
  ]
}
```

I file video vanno in `static/promos/`. Usare `.mp4` (H.264) per massima compatibilità.

---

## Architettura

Tutte le modifiche sono confinate in `frontend/src/Showroom.jsx`.

### 1. `isVideo(src)` — helper puro

```js
function isVideo(src) {
  return /\.(mp4|webm|ogg)$/i.test(src);
}
```

### 2. `useSlideshow(slides, duration)` — modifica

Il hook calcola `paused` internamente, eliminando qualsiasi problema di ordinamento nel chiamante. Restituisce anche `forceAdvance` e `isVideoSlide`.

```js
function useSlideshow(slides, duration) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  const currentSlide = slides[index] ?? null;
  const paused = currentSlide?.type === "promo" && isVideo(currentSlide.data ?? "");

  const forceAdvance = useCallback(() => {
    setProgress(0);
    setIndex(i => (i + 1) % slides.length);
  }, [slides.length]);
  // forceAdvance è stabile tra i render (solo slides.length nelle deps)
  // viene chiamato esclusivamente da onEnded del video — mai dall'interno dell'useEffect

  useEffect(() => {
    if (!slides || slides.length === 0) return;
    startRef.current = Date.now();
    setProgress(0);
    if (paused) return; // nessun interval creato: advance né tick

    const advance = setInterval(() => {
      setIndex(i => (i + 1) % slides.length);
    }, duration);

    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min((elapsed / duration) * 100, 100));
    }, 50);

    return () => { clearInterval(advance); clearInterval(tick); };
  }, [index, slides, duration, paused]);
  // paused nelle deps: quando index cambia via forceAdvance, il re-render rivaluta
  // paused sul nuovo currentSlide e riesegue l'effect — nessun loop perché
  // forceAdvance non è mai chiamato dall'interno dell'effect

  return { index, progress, forceAdvance, isVideoSlide: paused };
}
```

### 3. `VideoPromoSlide` — nuovo componente

Props: `{ src, onEnded, cars }`

**Layout:**
```
┌──────────────────────────────────────┬──────────────┐
│  div position:relative overflow:hid  │  card 1      │
│  ┌──────────────────────────────┐    │  card 2      │
│  │ BG video: cover blur(24px)   │    │  card 3      │
│  │ FG video: contain centrato   │    │              │
│  └──────────────────────────────┘    │              │
│  flex: 2                             │  flex: 1     │
└──────────────────────────────────────┴──────────────┘
```

**Area video (`flex: 2`, `position: relative`, `overflow: hidden`, `height: 100%`):**

| Elemento | Stile |
|---|---|
| BG `<video>` | `position:absolute inset:0 width:100% height:100% objectFit:cover filter:blur(24px) transform:scale(1.1)` + `aria-hidden="true"` |
| FG `<video>` | `position:absolute left:50% top:50% transform:translate(-50%,-50%) height:100% width:auto maxWidth:100%` |
| Entrambi | `autoPlay muted playsInline` — no `loop` — stessa `src` |
| `onEnded` | su FG → chiama prop `onEnded` |
| `onError` | su FG → chiama prop `onEnded` (skip silenzioso; BG rimane montato fino a unmount — accettabile) |

Nota sul desync: il BG è sfocato a `blur(24px)` e scalato — qualsiasi desync con il FG è visivamente impercettibile. Accettabile per questo use case.

**Mini-lista auto (`flex: 1`, `display: flex`, `flexDirection: column`, `gap: 4px`, `height: 100%`):**

Mostra `cars.length` card (0–3). Ogni card:

| Proprietà | Valore |
|---|---|
| Container | `flex: 1`, `display: flex`, `minHeight: 0`, `overflow: hidden`, `background: WHITE`, `border: 3px solid DARK`, `boxShadow: 3px 3px 0 CYAN` |
| Immagine | `width: 38%`, `height: 100%`, `objectFit: cover`, `flexShrink: 0`; mancante → `background: #f0f0f0` |
| Testo (div `flex:1 padding:6px display:flex flexDirection:column justifyContent:center gap:4px overflow:hidden`) | — |
| Titolo | `fontFamily: Rubik Mono One`, `fontSize: clamp(0.55rem, 1.2vmin, 0.9rem)`, `color: DARK`, `overflow: hidden`, `textOverflow: ellipsis`, `whiteSpace: nowrap` |
| Prezzo | `fontFamily: Rubik Mono One`, `fontSize: clamp(0.6rem, 1.3vmin, 1rem)`, `color: YELLOW`, `background: DARK`, `display: inline-block`, `padding: 2px 6px`, `alignSelf: flex-start` |

`nextCars` è il snapshot delle auto al momento del render corrente (reattivo per indice, ma il timer è sospeso durante il video quindi la lista non cambia mentre il video gira).

### 4. `PromoSlide` — modifica firma

```js
function PromoSlide({ src, onEnded, nextCars }) {
  if (isVideo(src)) {
    return <VideoPromoSlide src={src} onEnded={onEnded} cars={nextCars ?? []} />;
  }
  // codice immagine esistente invariato — onEnded e nextCars ignorati quando undefined
  const [err, setErr] = useState(false);
  return ( /* ...codice esistente... */ );
}
```

### 5. `Showroom` — wiring

```js
// useSlideshow ora restituisce isVideoSlide — nessun problema di ordinamento
const { index, progress, forceAdvance, isVideoSlide } = useSlideshow(slides, duration);

const currentSlide = slides[index] || null;

const nextCars = useMemo(() => {
  return slides
    .slice(index + 1)
    .concat(slides.slice(0, index))
    .filter(s => s.type === "car")
    .slice(0, 3)
    .map(s => s.data);
}, [slides, index]);

// nel JSX (all'interno del ramo currentSlide presente):
slideContent = currentSlide.type === "promo"
  ? <PromoSlide
      src={currentSlide.data}
      onEnded={isVideoSlide ? forceAdvance : undefined}
      nextCars={isVideoSlide ? nextCars : undefined}
    />
  : <CarSlide key={index} car={currentSlide.data} />;
```

---

## Invariato

`settings.json` schema · `stock.json` · CMS Streamlit · `buildSlides()` · `CarSlide` · comportamento `PromoSlide` immagini · `topBar` · `bottomBar`

---

## Edge case

| Caso | Comportamento |
|---|---|
| Video non trovato / errore | `onError` → `onEnded()` → slide avanza (skip silenzioso) |
| Meno di 3 auto nel listino | Mini-lista mostra N card (1 o 2) — `flex:1` le distribuisce equamente |
| Nessuna auto in coda (indice finale) | `concat(slides.slice(0,index))` riprende dall'inizio — sempre ≥1 auto |
| Video orizzontale 16:9 | Blur riempie i lati; FG occupa tutta la larghezza disponibile |
| Video molto corto (< 1s) | `onEnded` scatta regolarmente — `forceAdvance` avanza, nessun loop |
| Array `promo` con solo video | Funziona normalmente — nessuna promo immagine |

## Limitazioni note

- Leggero desync BG/FG video su connessioni lente: accettabile (BG è blur puro)
- `vmin` per font-size mini-card riferito alla viewport intera: su 4K la lista occupa 1/3 dello schermo — verificare leggibilità sul display target (TV 55")
