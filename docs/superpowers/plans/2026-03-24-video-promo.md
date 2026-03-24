# Video Promozionale nel Kiosk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere supporto video promozionali (`.mp4`, `.webm`, `.ogg`) nella rotazione slide del kiosk Rotolo Auto, con layout video 2/3 + mini-lista auto 1/3 e sfondo blurrato per video verticali.

**Architecture:** Tutte le modifiche sono confinate in `frontend/src/Showroom.jsx`. Il rilevamento avviene per estensione file — zero modifiche a settings.json o stock.json. `useSlideshow` calcola `paused` internamente e restituisce `forceAdvance`/`isVideoSlide`; il video avanza la slide via `onEnded`.

**Tech Stack:** React 18, Vite, inline styles (no CSS modules), nessun test runner frontend (verifica manuale su dev server).

---

## File structure

| File | Modifica |
|---|---|
| `frontend/src/Showroom.jsx` | Unico file modificato — tutti i task seguenti |

Non servono nuovi file: il componente `VideoPromoSlide` viene aggiunto nello stesso file.

---

## Prerequisito: video di test

Prima di iniziare, procurati un file video `.mp4` di prova (può essere qualsiasi video breve, anche girato col telefono in verticale). Copialo in `static/promos/test-video.mp4`. Non fare commit di questo file.

---

## Task 1: helper `isVideo`

**Files:**
- Modify: `frontend/src/Showroom.jsx` (dopo le costanti di design token, prima di `formatKm`)

- [ ] **Step 1: Aggiungi l'helper dopo il blocco dei design token (riga ~12)**

```js
const VIDEO_EXTS = /\.(mp4|webm|ogg)$/i;

function isVideo(src) {
  return VIDEO_EXTS.test(src ?? "");
}
```

- [ ] **Step 2: Verifica manuale nel browser dev console**

Avvia il dev server:
```bash
cd frontend && npm run dev
```
Apri http://localhost:5173, poi nella console del browser:
```js
// incolla manualmente per test rapido
const VIDEO_EXTS = /\.(mp4|webm|ogg)$/i;
console.assert(VIDEO_EXTS.test("static/promos/video.mp4") === true);
console.assert(VIDEO_EXTS.test("static/promos/slide.jpg") === false);
console.assert(VIDEO_EXTS.test("") === false);
console.assert(VIDEO_EXTS.test(null ?? "") === false);
console.log("isVideo: OK");
```
Expected: `isVideo: OK` senza errori.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/Showroom.jsx
git commit -m "feat: add isVideo helper for promo video detection"
```

---

## Task 2: modifica `useSlideshow`

**Files:**
- Modify: `frontend/src/Showroom.jsx` — funzione `useSlideshow` (attualmente righe ~51-77)

Il hook attuale ha firma `useSlideshow(slides, duration)` e restituisce `{ index, progress }`. Lo modifichiamo per calcolare `paused` internamente e aggiungere `forceAdvance`.

- [ ] **Step 1: Aggiungi import `useCallback` in cima al file**

La riga 1 attuale è:
```js
import { useState, useEffect, useRef, useMemo } from "react";
```
Diventa:
```js
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
```

- [ ] **Step 2: Sostituisci l'intera funzione `useSlideshow`**

Sostituisci da `function useSlideshow(slides, duration) {` fino alla sua chiusura `}` con:

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

  useEffect(() => {
    if (!slides || slides.length === 0) return;
    startRef.current = Date.now();
    setProgress(0);
    if (paused) return;

    const advance = setInterval(() => {
      setIndex(i => (i + 1) % slides.length);
    }, duration);

    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min((elapsed / duration) * 100, 100));
    }, 50);

    return () => {
      clearInterval(advance);
      clearInterval(tick);
    };
  }, [index, slides, duration, paused]);

  return { index, progress, forceAdvance, isVideoSlide: paused };
}
```

- [ ] **Step 3: Verifica che il kiosk funzioni ancora normalmente**

Con il dev server attivo (o riavvialo), apri http://localhost:5173. Le slide delle auto devono scorrere normalmente con la progress bar animata. Nessun video in settings.json ancora — comportamento identico a prima.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/Showroom.jsx
git commit -m "feat: useSlideshow adds forceAdvance and paused-on-video logic"
```

---

## Task 3: componente `VideoPromoSlide`

**Files:**
- Modify: `frontend/src/Showroom.jsx` — inserire il nuovo componente dopo `PromoSlide` (attualmente ~riga 165)

- [ ] **Step 1: Inserisci `VideoPromoSlide` dopo la funzione `PromoSlide`**

```js
// ---------------------------------------------------------------------------
// VideoPromoSlide — video promo con blur BG e mini-lista auto a destra
// ---------------------------------------------------------------------------

function MiniCarCard({ car }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      overflow: "hidden",
      background: WHITE,
      border: `3px solid ${DARK}`,
      boxShadow: `3px 3px 0 ${CYAN}`,
    }}>
      {/* Immagine */}
      <div style={{
        width: "38%",
        flexShrink: 0,
        background: "#f0f0f0",
        overflow: "hidden",
      }}>
        {car.immagine && !imgErr && (
          <img
            src={car.immagine}
            alt={car.titolo}
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </div>
      {/* Testo */}
      <div style={{
        flex: 1,
        padding: "6px 8px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "4px",
        overflow: "hidden",
        minWidth: 0,
      }}>
        <div style={{
          fontFamily: "'Rubik Mono One', sans-serif",
          fontSize: "clamp(0.55rem, 1.2vmin, 0.9rem)",
          color: DARK,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {car.titolo}
        </div>
        {car.prezzo && (
          <div style={{
            fontFamily: "'Rubik Mono One', sans-serif",
            fontSize: "clamp(0.6rem, 1.3vmin, 1rem)",
            color: YELLOW,
            background: DARK,
            display: "inline-block",
            padding: "2px 6px",
            alignSelf: "flex-start",
          }}>
            {car.prezzo}
          </div>
        )}
      </div>
    </div>
  );
}

function VideoPromoSlide({ src, onEnded, cars }) {
  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "row",
      gap: "clamp(6px, 1vw, 14px)",
    }}>
      {/* Area video — flex:2 */}
      <div style={{
        flex: 2,
        position: "relative",
        overflow: "hidden",
        background: DARK,
      }}>
        {/* Background video — blurrato, solo decorativo */}
        <video
          src={src}
          autoPlay
          muted
          playsInline
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(24px)",
            transform: "scale(1.1)",
            opacity: 0.85,
          }}
        />
        {/* Foreground video — crisp, centrato */}
        <video
          src={src}
          autoPlay
          muted
          playsInline
          onEnded={onEnded}
          onError={onEnded}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            height: "100%",
            width: "auto",
            maxWidth: "100%",
          }}
        />
      </div>

      {/* Mini-lista auto — flex:1 */}
      {cars && cars.length > 0 && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "clamp(4px, 0.6vw, 8px)",
          minWidth: 0,
        }}>
          {cars.map((car, i) => (
            <MiniCarCard key={i} car={car} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifica che il file compili senza errori**

Il dev server (Vite) mostra errori in console se la sintassi è rotta. Apri http://localhost:5173 e controlla che le slide girino ancora normalmente.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/Showroom.jsx
git commit -m "feat: add VideoPromoSlide component with blur BG and mini car list"
```

---

## Task 4: modifica `PromoSlide` per branch video

**Files:**
- Modify: `frontend/src/Showroom.jsx` — funzione `PromoSlide` (attualmente ~righe 165-178)

- [ ] **Step 1: Modifica la firma e aggiungi il branch video**

Sostituisci l'intera funzione `PromoSlide` con:

```js
function PromoSlide({ src, onEnded, nextCars }) {
  // useState DEVE stare prima di qualsiasi return condizionale (Rules of Hooks)
  const [err, setErr] = useState(false);

  if (isVideo(src)) {
    return (
      <VideoPromoSlide
        src={src}
        onEnded={onEnded}
        cars={nextCars ?? []}
      />
    );
  }

  // Immagine promo — comportamento invariato
  return (
    <div style={s.promoWrapper}>
      {err ? (
        <p style={{ color: DARK, fontFamily: "'Rubik Mono One'", fontSize: "2rem" }}>
          PROMO
        </p>
      ) : (
        <img src={src} alt="Promo" style={s.promoImg} onError={() => setErr(true)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifica promo immagini esistenti**

Se hai immagini promo configurate in `settings.json`, verifica che appaiano ancora correttamente. Se non hai promo configurate, salta.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/Showroom.jsx
git commit -m "feat: PromoSlide delegates to VideoPromoSlide for video extensions"
```

---

## Task 5: wiring in `Showroom`

**Files:**
- Modify: `frontend/src/Showroom.jsx` — funzione `Showroom` (da ~riga 201)

- [ ] **Step 1: Aggiorna destructuring di `useSlideshow`**

Trova la riga:
```js
const { index, progress } = useSlideshow(
```
Sostituiscila con:
```js
const { index, progress, forceAdvance, isVideoSlide } = useSlideshow(
```
(il resto degli argomenti rimane uguale: `loading || error || slides.length === 0 ? [] : slides, duration`)

- [ ] **Step 2: Aggiungi `nextCars` con `useMemo`**

Subito dopo il `useMemo` esistente per `slides`, aggiungi:

```js
const nextCars = useMemo(() => {
  if (!slides || slides.length === 0) return [];
  return slides
    .slice(index + 1)
    .concat(slides.slice(0, index))
    .filter(s => s.type === "car")
    .slice(0, 3)
    .map(s => s.data);
}, [slides, index]);
```

- [ ] **Step 3: Aggiorna la chiamata a `PromoSlide` nel JSX**

Trova il ramo che renderizza `PromoSlide`:
```js
? <PromoSlide src={currentSlide.data} />
```
Sostituisci con:
```js
? <PromoSlide
    src={currentSlide.data}
    onEnded={isVideoSlide ? forceAdvance : undefined}
    nextCars={isVideoSlide ? nextCars : undefined}
  />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/Showroom.jsx
git commit -m "feat: Showroom wires forceAdvance and nextCars to PromoSlide for video"
```

---

## Task 6: test end-to-end con video reale

- [ ] **Step 1: Aggiungi il video di test a settings.json**

Apri `settings.json` (root del repo) e aggiungi il path del video nell'array `promo`:
```json
{
  "promo": ["static/promos/test-video.mp4"]
}
```
Se non hai promo esistenti, crea l'array da zero. Se hai già promo immagini, aggiungilo in mezzo.

- [ ] **Step 2: Verifica nel browser — video orizzontale**

Con dev server attivo (http://localhost:5173):
1. Aspetta che arrivi la slide video (ogni 4 auto)
2. Verifica: il video parte automaticamente, è muto
3. Verifica: il blur si vede ai lati (più evidente con video verticale)
4. Verifica: a destra appaiono fino a 3 mini-card con foto, titolo, prezzo
5. Verifica: la progress bar è ferma durante il video
6. Verifica: quando il video finisce, la slide avanza automaticamente

- [ ] **Step 3: Verifica con video verticale (se disponibile)**

Se hai un video girato col telefono (9:16), sostituiscilo al test e verifica:
1. Il video appare centrato
2. I lati sono riempiti con il blur dello stesso video (non bande nere)

- [ ] **Step 4: Verifica fallback errore**

Modifica temporaneamente il path in settings.json con un file inesistente:
```json
{ "promo": ["static/promos/non-esiste.mp4"] }
```
Ricarica il browser. La slide video deve essere saltata silenziosamente (avanza alla successiva senza bloccarsi).
Ripristina il path corretto.

- [ ] **Step 5: Build finale**

```bash
cd frontend && npm run build
```
Expected: build senza errori, output in root del repo (`index.html` + `assets/`).

- [ ] **Step 6: Rimuovi test-video.mp4 da settings.json**

Ripristina `settings.json` alla configurazione promo originale (senza il video di test, a meno che non voglia lasciarlo).

- [ ] **Step 7: Commit build**

```bash
cd ..
git add index.html assets/
git commit -m "feat: build frontend con supporto video promozionali"
```

---

## Riepilogo commit attesi

```
feat: add isVideo helper for promo video detection
feat: useSlideshow adds forceAdvance and paused-on-video logic
feat: add VideoPromoSlide component with blur BG and mini car list
feat: PromoSlide delegates to VideoPromoSlide for video extensions
feat: Showroom wires forceAdvance and nextCars to PromoSlide for video
feat: build frontend con supporto video promozionali
```
