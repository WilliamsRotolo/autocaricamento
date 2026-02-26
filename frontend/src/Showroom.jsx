import { useState, useEffect, useRef, useMemo } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOLD = "#FFD700";
const DARK = "#111";
const WHITE = "#fff";
const GRAY = "#222";

const CONTACT = {
  phone: "011 855220",
  locations: [
    "Via Nizza 5 - Torino",
    "Corso Unità d'Italia 13 - Torino",
    "Via Filadelfia 157 - Torino",
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

/** Build slide list: car slides + promo slides every 4 car slides */
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
  }, [index, slides, duration]); // re-run each time index changes to reset timer

  return { index, progress };
}

// ---------------------------------------------------------------------------
// CarSlide component
// ---------------------------------------------------------------------------

function CarSlide({ car }) {
  const [imgError, setImgError] = useState(false);
  const [qrError, setQrError] = useState(false);
  const hasImage = car.immagine && !imgError;

  const tags = [
    car.anno ? { label: car.anno } : null,
    car.km !== undefined && car.km !== "" ? { label: formatKm(car.km) } : null,
    car.alimentazione ? { label: car.alimentazione } : null,
    car.cambio ? { label: car.cambio.charAt(0).toUpperCase() + car.cambio.slice(1) } : null,
  ].filter(Boolean);

  const qrUrl = car.link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(car.link)}`
    : null;

  return (
    <div style={s.slideWrapper}>
      {/* ---- Left: image ---- */}
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
            <span style={s.noPhotoText}>FOTO</span>
            <span style={s.noPhotoSlash}>/</span>
            <span style={s.noPhotoText}>NON</span>
            <span style={s.noPhotoSlash}>/</span>
            <span style={s.noPhotoText}>DISPONIBILE</span>
          </div>
        )}
      </div>

      {/* ---- Right: info ---- */}
      <div style={s.infoCol}>
        {/* Title */}
        <h1 style={s.title}>{car.titolo ? car.titolo.toUpperCase() : ""}</h1>

        {/* Tags */}
        {tags.length > 0 && (
          <div style={s.tagsRow}>
            {tags.map((t, i) => (
              <span key={i} style={s.tag}>
                {t.label}
              </span>
            ))}
          </div>
        )}

        {/* Price */}
        {car.prezzo && (
          <div style={s.priceBox}>
            <span style={s.priceText}>{car.prezzo}</span>
          </div>
        )}

        {/* QR code */}
        {qrUrl && !qrError && (
          <div style={s.qrBlock}>
            <img
              src={qrUrl}
              alt="QR code"
              width={110}
              height={110}
              style={s.qrImg}
              onError={() => setQrError(true)}
            />
            <span style={s.qrLabel}>Scansiona per i dettagli</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromoSlide component
// ---------------------------------------------------------------------------

function PromoSlide({ src }) {
  const [err, setErr] = useState(false);
  return (
    <div style={s.promoWrapper}>
      {err ? (
        <p style={{ color: "#333", fontFamily: "'Rubik Mono One'", fontSize: "2rem" }}>
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
// Main Showroom component
// ---------------------------------------------------------------------------

export default function Showroom() {
  const [cars, setCars] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  const duration = Math.max(rawDuration, 2000);
  const promo = settings ? settings.promo || [] : [];
  const slides = useMemo(
    () => (cars.length > 0 ? buildSlides(cars, promo) : []),
    [cars, promo]
  );

  const { index, progress } = useSlideshow(
    loading || error || slides.length === 0 ? [] : slides,
    duration
  );

  const currentSlide = slides[index] || null;

  // ---- Render states ----
  let slideContent;
  if (loading) {
    slideContent = <div style={s.centerMsg}>Caricamento...</div>;
  } else if (error) {
    slideContent = (
      <div style={s.centerMsg}>
        <span style={{ color: "#f55" }}>Errore caricamento dati</span>
        <br />
        <span style={{ fontSize: "0.85rem", opacity: 0.6 }}>{error}</span>
      </div>
    );
  } else if (slides.length === 0) {
    slideContent = <div style={s.centerMsg}>Nessun annuncio</div>;
  } else if (currentSlide) {
    if (currentSlide.type === "promo") {
      slideContent = <PromoSlide src={currentSlide.data} />;
    } else {
      slideContent = <CarSlide key={index} car={currentSlide.data} />;
    }
  }

  return (
    <div style={s.root}>
      {/* TOP BAR */}
      <div style={s.topBar}>
        <span style={s.brandName}>ROTOLO AUTOMOBILI</span>
        <span style={s.brandTagline}>PREZZO CHIARO</span>
      </div>

      {/* SLIDE AREA */}
      <div style={s.slideArea}>{slideContent}</div>

      {/* PROGRESS BAR */}
      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${progress}%` }} />
      </div>

      {/* BOTTOM BAR */}
      <div style={s.bottomBar}>
        <div style={s.locationsList}>
          {CONTACT.locations.map((loc, i) => (
            <span key={i} style={s.locationItem}>
              {loc}
            </span>
          ))}
        </div>
        <div style={s.phoneNumber}>{CONTACT.phone}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = {
  root: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: DARK,
    color: WHITE,
  },

  // --- Top bar ---
  topBar: {
    height: "68px",
    background: GOLD,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 32px",
    flexShrink: 0,
    borderBottom: `4px solid ${DARK}`,
  },
  brandName: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "1.6rem",
    color: DARK,
    transform: "rotate(-1deg)",
    display: "inline-block",
    letterSpacing: "0.02em",
  },
  brandTagline: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 900,
    fontSize: "1rem",
    color: DARK,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    border: `3px solid ${DARK}`,
    padding: "4px 14px",
  },

  // --- Slide area ---
  slideArea: {
    flex: 1,
    display: "flex",
    alignItems: "stretch",
    overflow: "hidden",
    minHeight: 0,
  },

  // --- Progress bar ---
  progressTrack: {
    height: "6px",
    background: "rgba(255,255,255,0.1)",
    flexShrink: 0,
  },
  progressFill: {
    height: "100%",
    background: GOLD,
    transition: "width 50ms linear",
  },

  // --- Bottom bar ---
  bottomBar: {
    height: "52px",
    background: "#0d0d0d",
    borderTop: `3px solid ${GOLD}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    flexShrink: 0,
    gap: "16px",
  },
  locationsList: {
    display: "flex",
    gap: "28px",
    alignItems: "center",
  },
  locationItem: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: "0.78rem",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: "0.03em",
  },
  phoneNumber: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "1.2rem",
    color: GOLD,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
  },

  // --- Car slide ---
  slideWrapper: {
    display: "flex",
    flexDirection: "row",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  imageCol: {
    width: "58%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px 24px 24px",
  },
  carImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    display: "block",
    boxShadow: `10px 10px 0 ${GOLD}`,
  },
  noPhoto: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    background: "#1a1a1a",
    width: "100%",
    height: "100%",
    border: `4px solid #333`,
  },
  noPhotoText: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(1.2rem, 3vw, 2.5rem)",
    color: "#444",
    letterSpacing: "0.1em",
  },
  noPhotoSlash: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(0.8rem, 2vw, 1.4rem)",
    color: "#333",
  },
  infoCol: {
    width: "42%",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "24px 24px 24px 8px",
    gap: "16px",
    overflow: "hidden",
  },

  // Title
  title: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(0.9rem, 2.2vw, 2rem)",
    color: WHITE,
    lineHeight: 1.15,
    letterSpacing: "0.01em",
    wordBreak: "break-word",
  },

  // Tags row
  tagsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  tag: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: "0.75rem",
    background: "#222",
    color: "rgba(255,255,255,0.85)",
    border: "2px solid #444",
    padding: "4px 10px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },

  // Price
  priceBox: {
    background: GOLD,
    display: "inline-flex",
    alignSelf: "flex-start",
    padding: "10px 22px",
    border: `4px solid ${DARK}`,
    boxShadow: `6px 6px 0 ${DARK}`,
    transform: "rotate(-1deg)",
  },
  priceText: {
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "clamp(1.2rem, 3vw, 2.4rem)",
    color: DARK,
    letterSpacing: "0.02em",
  },

  // QR code
  qrBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
    marginTop: "4px",
  },
  qrImg: {
    border: `4px solid ${GOLD}`,
    display: "block",
  },
  qrLabel: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: "0.72rem",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: "0.04em",
  },

  // Promo slide
  promoWrapper: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: DARK,
    padding: "16px",
  },
  promoImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  },

  // Loading / error / empty states
  centerMsg: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: "1.6rem",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: "0.05em",
    textAlign: "center",
    padding: "32px",
  },
};
