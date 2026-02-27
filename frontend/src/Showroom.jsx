import { useState, useEffect, useRef, useMemo } from "react";

// ---------------------------------------------------------------------------
// Design tokens — fedele al design NEWFRONTEND (neon retro anni '80)
// ---------------------------------------------------------------------------

const YELLOW  = "#FFD700";
const DARK    = "#111";
const WHITE   = "#fff";
const MAGENTA = "#FF00FF";
const CYAN    = "#00FFFF";

const CONTACT = {
  phone: "011 855220",
  locations: [
    "Via Stradella 82 - Torino",
    "Via Cecchi 62 - Torino",
    "Via Tunisi 50 - Torino",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatKm(km) {
  if (!km) return "";
  const num = parseInt(String(km).replace(/\D/g, ""), 10);
  if (isNaN(num)) return String(km);
  return num === 0 ? "0 km" : `${num.toLocaleString("it-IT")} km`;
}

function buildSlides(cars, promos) {
  const slides = [];
  let carCount = 0;
  for (const car of cars) {
    slides.push({ type: "car", data: car });
    carCount++;
    if (carCount % 4 === 0 && promos && promos.length > 0) {
      const promoIndex = Math.floor(carCount / 4 - 1) % promos.length;
      slides.push({ type: "promo", data: promos[promoIndex] });
    }
  }
  return slides;
}

// ---------------------------------------------------------------------------
// useSlideshow hook
// ---------------------------------------------------------------------------

function useSlideshow(slides, duration) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!slides || slides.length === 0) return;
    startRef.current = Date.now();
    setProgress(0);

    const advance = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, duration);

    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min((elapsed / duration) * 100, 100));
    }, 50);

    return () => {
      clearInterval(advance);
      clearInterval(tick);
    };
  }, [index, slides, duration]);

  return { index, progress };
}

// ---------------------------------------------------------------------------
// CarSlide — card bianca su sfondo giallo, come nell'originale
// ---------------------------------------------------------------------------

function CarSlide({ car }) {
  const [imgError, setImgError] = useState(false);
  const [qrError, setQrError] = useState(false);
  const hasImage = car.immagine && !imgError;

  const tags = [
    car.anno        ? { label: car.anno }                                    : null,
    car.km !== undefined && car.km !== "" ? { label: formatKm(car.km) }     : null,
    car.alimentazione ? { label: car.alimentazione }                         : null,
    car.cambio      ? { label: car.cambio.charAt(0).toUpperCase() + car.cambio.slice(1) } : null,
  ].filter(Boolean);

  const tipoLabel = { km0: "KM ZERO", usato: "USATO", outlet: "OUTLET" }[car.tipo]
    ?? car.tipo?.toUpperCase() ?? "";

  const qrUrl = car.link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(car.link)}`
    : null;

  return (
    <div style={s.slideOuter}>
      <div style={s.card}>
        {/* ---- Colonna sinistra: immagine ---- */}
        <div style={s.imageCol}>
          {hasImage ? (
            <img
              src={car.immagine}
              alt={car.titolo}
              onError={() => setImgError(true)}
              style={s.carImage}
            />
          ) : (
            <div style={s.noPhoto}>
              <span style={s.noPhotoText}>FOTO NON DISPONIBILE</span>
            </div>
          )}
        </div>

        {/* ---- Colonna destra: info ---- */}
        <div style={s.infoCol}>
          {/* Tipo badge (KM ZERO / USATO / OUTLET) */}
          {tipoLabel && (
            <div style={s.tipoBadge}>{tipoLabel}</div>
          )}

          {/* Titolo */}
          <h1 style={s.title}>{car.titolo ? car.titolo.toUpperCase() : ""}</h1>

          {/* Tag row (anno / km / carburante / cambio) */}
          {tags.length > 0 && (
            <div style={s.tagsRow}>
              {tags.map((t, i) => (
                <span key={i} style={s.tag}>{t.label}</span>
              ))}
            </div>
          )}

          {/* Prezzo */}
          {car.prezzo && (
            <div style={s.priceBox}>
              <span style={s.priceText}>{car.prezzo}</span>
            </div>
          )}

          {/* QR code — grande e centrato */}
          {qrUrl && !qrError && (
            <div style={s.qrBlock}>
              <img
                src={qrUrl}
                alt="QR code"
                style={s.qrImg}
                onError={() => setQrError(true)}
              />
              <span style={s.qrLabel}>Scansiona per i dettagli</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromoSlide
// ---------------------------------------------------------------------------

function PromoSlide({ src }) {
  const [err, setErr] = useState(false);
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

// ---------------------------------------------------------------------------
// Fetch with retry
// ---------------------------------------------------------------------------

async function fetchWithRetry(url, maxAttempts = 5, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((res) => setTimeout(res, baseDelay * attempt));
    }
  }
}

// ---------------------------------------------------------------------------
// Showroom principale
// ---------------------------------------------------------------------------

export default function Showroom() {
  const [cars, setCars]       = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    Promise.all([
      fetchWithRetry("./stock.json"),
      fetchWithRetry("./settings.json"),
    ])
      .then(([stockData, settingsData]) => {
        setCars(stockData);
        setSettings(settingsData);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  const rawDuration = settings ? (settings.durata_slide || 0) * 1000 : 6000;
  const duration    = Math.max(rawDuration, 2000);
  const promo       = useMemo(() => settings?.promo ?? [], [settings]);
  const slides      = useMemo(
    () => (cars.length > 0 ? buildSlides(cars, promo) : []),
    [cars, promo]
  );

  const { index, progress } = useSlideshow(
    loading || error || slides.length === 0 ? [] : slides,
    duration
  );

  const currentSlide = slides[index] || null;

  let slideContent;
  if (loading) {
    slideContent = <div style={s.centerMsg}>Caricamento...</div>;
  } else if (error) {
    slideContent = (
      <div style={s.centerMsg}>
        <span style={{ color: "#900" }}>Errore caricamento dati</span>
        <br />
        <span style={{ fontSize: "0.85rem", opacity: 0.6 }}>{error}</span>
      </div>
    );
  } else if (slides.length === 0) {
    slideContent = <div style={s.centerMsg}>Nessun annuncio</div>;
  } else if (currentSlide) {
    slideContent = currentSlide.type === "promo"
      ? <PromoSlide src={currentSlide.data} />
      : <CarSlide key={index} car={currentSlide.data} />;
  }

  return (
    <div style={s.root}>
      {/* Griglia retro anni '80 */}
      <div style={s.bgGrid} />

      {/* BARRA SUPERIORE */}
      <div style={s.topBar}>
        <div style={s.brandBadge}>
          PREZZO CHIARO — ROTOLO AUTOMOBILI
        </div>
      </div>

      {/* AREA SLIDE */}
      <div style={s.slideArea}>{slideContent}</div>

      {/* BARRA PROGRESSO */}
      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${progress}%` }} />
      </div>

      {/* BARRA INFERIORE */}
      <div style={s.bottomBar}>
        <div style={s.phoneNumber}>{CONTACT.phone}</div>
        <div style={s.locationsList}>
          {CONTACT.locations.map((loc, i) => (
            <span key={i} style={s.locationItem}>{loc}</span>
          ))}
        </div>
        <div style={s.torinoBadge}>TORINO</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stili
// ---------------------------------------------------------------------------

const s = {
  // Root — sfondo GIALLO
  root: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: YELLOW,
    color: DARK,
    position: "relative",
  },

  // Griglia anni '80
  bgGrid: {
    position: "fixed",
    top: 0, left: 0,
    width: "100%", height: "100%",
    backgroundImage:
      "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), " +
      "linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    pointerEvents: "none",
    zIndex: 0,
  },

  // Barra superiore — altezza vh, non px fissi
  topBar: {
    height: "8vh",
    minHeight: "52px",
    maxHeight: "80px",
    background: DARK,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 2vw",
    flexShrink: 0,
    borderBottom: `clamp(3px, 0.5vh, 6px) solid ${MAGENTA}`,
    position: "relative",
    zIndex: 2,
  },
  brandBadge: {
    display: "inline-block",
    backgroundColor: YELLOW,
    color: DARK,
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(0.85rem, 2.2vh, 1.6rem)",
    padding: "clamp(4px,0.6vh,8px) clamp(14px,2vw,30px)",
    transform: "rotate(-0.5deg)",
    boxShadow: `clamp(4px,0.7vw,8px) clamp(4px,0.7vw,8px) 0 ${MAGENTA}`,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
  },

  // Area slide — padding ridotto per dare più spazio alla card
  slideArea: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "clamp(6px, 1vmin, 14px)",
    overflow: "hidden",
    position: "relative",
    zIndex: 1,
    minHeight: 0,
  },

  slideOuter: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // Card — ombra ridotta per non essere clippata, padding e maxHeight responsive
  card: {
    width: "96%",
    maxWidth: "1400px",
    height: "96%",           // altezza fissa al 96% invece di maxHeight per evitare overflow
    backgroundColor: WHITE,
    border: `clamp(5px, 0.6vw, 10px) solid ${DARK}`,
    boxShadow: `clamp(8px,1.2vmin,18px) clamp(8px,1.2vmin,18px) 0 ${CYAN}`,
    display: "flex",
    flexDirection: "row",
    padding: "clamp(10px, 1.4vw, 22px)",
    overflow: "hidden",
    animation: "slideIn 0.5s ease-out",
    boxSizing: "border-box",
  },

  // Colonna immagine
  imageCol: {
    flex: "1.2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: "clamp(10px, 1.4vw, 22px)",
    overflow: "hidden",
    background: "#f4f4f4",
    border: `clamp(2px, 0.3vw, 4px) solid ${DARK}`,
    minHeight: 0,
    minWidth: 0,
  },
  carImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  noPhoto: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  noPhotoText: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(0.6rem, 1.5vmin, 1.1rem)",
    color: "#bbb",
    letterSpacing: "0.1em",
  },

  // Colonna info — gap e overflow responsive
  infoCol: {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "clamp(5px, 1vh, 14px)",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
  },

  // Badge tipo
  tipoBadge: {
    backgroundColor: MAGENTA,
    color: WHITE,
    display: "inline-block",
    padding: "clamp(3px,0.5vh,7px) clamp(8px,1vw,16px)",
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(0.75rem, 1.8vh, 1.24rem)",
    alignSelf: "flex-start",
    transform: "rotate(1.5deg)",
    boxShadow: `3px 3px 0 ${DARK}`,
    letterSpacing: "0.04em",
    flexShrink: 0,
  },

  // Titolo — vmin per mantenere proporzioni su 16:9
  title: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(1rem, 2.6vmin, 2.5rem)",
    color: DARK,
    lineHeight: 1.1,
    letterSpacing: "0.01em",
    wordBreak: "break-word",
    overflow: "hidden",
    flexShrink: 0,
  },

  // Tag row
  tagsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "clamp(4px, 0.6vw, 10px)",
    borderLeft: `clamp(4px, 0.5vw, 8px) solid ${YELLOW}`,
    paddingLeft: "clamp(8px, 1vw, 16px)",
    flexShrink: 0,
  },
  tag: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: "clamp(0.75rem, 1.4vh, 1.1rem)",
    color: "#444",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },

  // Prezzo
  priceBox: {
    backgroundColor: DARK,
    color: YELLOW,
    padding: "clamp(7px,1vh,14px) clamp(14px,2vw,28px)",
    display: "inline-block",
    alignSelf: "flex-start",
    boxShadow: `clamp(5px,0.7vw,10px) clamp(5px,0.7vw,10px) 0 ${MAGENTA}`,
    flexShrink: 0,
  },
  priceText: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(1.4rem, 3.6vmin, 3.4rem)",
    letterSpacing: "0.02em",
  },

  // QR — dimensione CSS responsive, immagine server 150px
  qrBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "clamp(3px, 0.5vh, 7px)",
    flexShrink: 0,
  },
  qrImg: {
    border: `clamp(2px, 0.3vw, 4px) solid ${DARK}`,
    display: "block",
    width: "clamp(80px, 13vh, 145px)",
    height: "clamp(80px, 13vh, 145px)",
  },
  qrLabel: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: "clamp(0.55rem, 1vh, 0.75rem)",
    color: "#666",
    letterSpacing: "0.04em",
  },

  // Barra progresso
  progressTrack: {
    height: "clamp(4px, 0.6vh, 8px)",
    background: "rgba(0,0,0,0.15)",
    flexShrink: 0,
    position: "relative",
    zIndex: 2,
  },
  progressFill: {
    height: "100%",
    background: MAGENTA,
    transition: "width 50ms linear",
  },

  // Barra inferiore — altezza vh
  bottomBar: {
    height: "6.5vh",
    minHeight: "44px",
    maxHeight: "68px",
    background: DARK,
    borderTop: `clamp(3px, 0.5vh, 6px) solid ${CYAN}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "0 2vw",
    flexShrink: 0,
    position: "relative",
    zIndex: 2,
    gap: "1vw",
  },
  phoneNumber: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(1.1rem, 2.4vh, 1.8rem)",
    color: CYAN,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
  },
  locationsList: {
    display: "flex",
    gap: "clamp(10px, 2vw, 28px)",
    alignItems: "center",
  },
  locationItem: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: "clamp(0.75rem, 1.55vh, 1.1rem)",
    color: WHITE,
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
  },
  torinoBadge: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(0.75rem, 1.55vh, 1.1rem)",
    color: YELLOW,
    border: `2px solid ${YELLOW}`,
    padding: "clamp(2px,0.3vh,4px) clamp(8px,1vw,14px)",
    whiteSpace: "nowrap",
  },

  // Slide promo
  promoWrapper: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "clamp(8px, 1.5vmin, 20px)",
  },
  promoImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    border: `clamp(4px, 0.5vw, 8px) solid ${DARK}`,
    boxShadow: `clamp(8px,1.2vmin,20px) clamp(8px,1.2vmin,20px) 0 ${MAGENTA}`,
  },

  // Stato caricamento / errore
  centerMsg: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(1rem, 2.5vh, 1.6rem)",
    color: DARK,
    letterSpacing: "0.05em",
    textAlign: "center",
    padding: "2vmin",
  },
};
