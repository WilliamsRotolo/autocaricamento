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

  // QR 50% più grande: 110 → 165
  const qrUrl = car.link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=165x165&data=${encodeURIComponent(car.link)}`
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
                width={165}
                height={165}
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
  // Root — sfondo GIALLO come nell'originale
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

  // Griglia anni '80 (sottile overlay su giallo)
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

  // Barra superiore — nera con bordo magenta
  topBar: {
    height: "72px",
    background: DARK,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 32px",
    flexShrink: 0,
    borderBottom: `6px solid ${MAGENTA}`,
    position: "relative",
    zIndex: 2,
  },
  brandBadge: {
    display: "inline-block",
    backgroundColor: YELLOW,
    color: DARK,
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "1.6rem",
    padding: "8px 30px",
    transform: "rotate(-0.5deg)",
    boxShadow: `8px 8px 0 ${MAGENTA}`,
    letterSpacing: "0.02em",
  },

  // Area slide — centrata su sfondo giallo
  slideArea: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    overflow: "hidden",
    position: "relative",
    zIndex: 1,
  },

  // Wrapper esterno della card (occupa tutto lo spazio slide)
  slideOuter: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // Card bianca con bordo nero e ombra cyan — esattamente come l'originale
  card: {
    width: "95%",
    maxWidth: "1300px",
    maxHeight: "85%",
    backgroundColor: WHITE,
    border: `10px solid ${DARK}`,
    boxShadow: `30px 30px 0 ${CYAN}`,
    display: "flex",
    flexDirection: "row",
    padding: "30px",
    overflow: "hidden",
    animation: "slideIn 0.5s ease-out",
  },

  // Colonna immagine
  imageCol: {
    flex: "1.2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: "30px",
    overflow: "hidden",
    background: "#f4f4f4",
    border: `4px solid ${DARK}`,
    minHeight: 0,
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
    fontSize: "clamp(0.7rem, 1.8vw, 1.2rem)",
    color: "#bbb",
    letterSpacing: "0.1em",
  },

  // Colonna info
  infoCol: {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "18px",
    overflow: "hidden",
  },

  // Badge tipo — magenta ruotato, come il tag "PREZZO REALE" dell'originale
  tipoBadge: {
    backgroundColor: MAGENTA,
    color: WHITE,
    display: "inline-block",
    padding: "8px 18px",
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "1rem",
    alignSelf: "flex-start",
    transform: "rotate(1.5deg)",
    boxShadow: `5px 5px 0 ${DARK}`,
    letterSpacing: "0.04em",
  },

  // Titolo — nero grande, come l'originale
  title: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(1rem, 2.4vw, 2.1rem)",
    color: DARK,
    lineHeight: 1.1,
    letterSpacing: "0.01em",
    wordBreak: "break-word",
  },

  // Tag row con bordo sinistro giallo — come il "details" dell'originale
  tagsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    borderLeft: `8px solid ${YELLOW}`,
    paddingLeft: "16px",
  },
  tag: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: "0.85rem",
    color: "#444",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },

  // Prezzo — nero con testo giallo e ombra magenta, come l'originale
  priceBox: {
    backgroundColor: DARK,
    color: YELLOW,
    padding: "16px 32px",
    display: "inline-block",
    alignSelf: "flex-start",
    boxShadow: `12px 12px 0 ${MAGENTA}`,
  },
  priceText: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(1.4rem, 3.5vw, 3rem)",
    letterSpacing: "0.02em",
  },

  // QR — centrato, 50% più grande (165 invece di 110)
  qrBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    marginTop: "4px",
  },
  qrImg: {
    border: `4px solid ${DARK}`,
    display: "block",
  },
  qrLabel: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: "0.75rem",
    color: "#666",
    letterSpacing: "0.04em",
  },

  // Barra progresso — fill magenta
  progressTrack: {
    height: "8px",
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

  // Barra inferiore — nera con bordo cyan
  bottomBar: {
    height: "56px",
    background: DARK,
    borderTop: `6px solid ${CYAN}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "0 28px",
    flexShrink: 0,
    position: "relative",
    zIndex: 2,
    gap: "16px",
  },
  phoneNumber: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "1.4rem",
    color: CYAN,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
  },
  locationsList: {
    display: "flex",
    gap: "24px",
    alignItems: "center",
  },
  locationItem: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: "0.85rem",
    color: WHITE,
    letterSpacing: "0.03em",
  },
  torinoBadge: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "0.9rem",
    color: YELLOW,
    border: `2px solid ${YELLOW}`,
    padding: "4px 15px",
    whiteSpace: "nowrap",
  },

  // Slide promo
  promoWrapper: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  promoImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    border: `8px solid ${DARK}`,
    boxShadow: `20px 20px 0 ${MAGENTA}`,
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
    fontSize: "1.6rem",
    color: DARK,
    letterSpacing: "0.05em",
    textAlign: "center",
    padding: "32px",
  },
};
