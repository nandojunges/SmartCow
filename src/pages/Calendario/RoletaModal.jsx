import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./roleta.styles.css";

/* ===== anima – leve e suave ===== */
const DUR = 0.45;
const EASE = [0.22, 0.61, 0.36, 1];
const PREFERS_REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const variants = {
  enter: (dir) => ({ y: dir > 0 ? 70 : -70, rotateX: dir > 0 ? -10 : 10, opacity: 0 }),
  center: { y: 0, rotateX: 0, opacity: 1 },
  exit: (dir) => ({ y: dir > 0 ? -70 : 70, rotateX: dir > 0 ? 10 : -10, opacity: 0 }),
};

/* ===== datas ===== */
const toISO = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
};
const addDays = (iso, inc) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + inc);
  return toISO(dt);
};
const fmtBR = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

/* ===== helpers de agrupamento ===== */
function keyFor(ev) {
  // se o backend já mandar, usamos
  if (ev.groupKey) return ev.groupKey;
  return [
    "PROTO",
    ev.protocoloTipo || "",
    ev.tipo || "",
    ev.title || "",
    String(ev.start || "").slice(0, 10),
    ev.hora || "",
  ].join("|");
}

function normalizeAnimalFromEvent(ev) {
  // aceita formatos diversos; vira {id, numero, brinco}
  const a =
    Array.isArray(ev.animais) && ev.animais.length
      ? ev.animais.map((x, i) => ({
          id: x?.id ?? `${x?.numero ?? i}-${x?.brinco ?? ""}`,
          numero: x?.numero ?? x?.nome ?? x,
          brinco: x?.brinco ?? null,
        }))
      : [
          {
            id:
              ev.animalId ??
              ev?.animal?.id ??
              `${ev.animalNumero ?? ""}-${ev.animalBrinco ?? ""}`,
            numero: ev.animalNumero ?? ev?.animal?.numero ?? null,
            brinco: ev.animalBrinco ?? ev?.animal?.brinco ?? null,
          },
        ];
  // remove vazios
  return a.filter((x) => x.numero != null || x.brinco);
}

function coalesceDayEvents(eventos, iso) {
  // filtra por dia
  const day = eventos.filter((ev) => String(ev.start || "").slice(0, 10) === iso);
  const map = new Map();
  day.forEach((ev) => {
    const k = keyFor(ev);
    if (!map.has(k)) {
      map.set(k, {
        ...ev,
        animais: [],
      });
    }
    map.get(k).animais.push(...normalizeAnimalFromEvent(ev));
  });

  // split por protocoloTipo (IATF / Pré-sincronização / Outros)
  const buckets = new Map();
  map.forEach((item) => {
    const label = item.protocoloTipo || "Outros";
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(item);
  });

  // ordena por título
  buckets.forEach((arr) =>
    arr.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")))
  );

  // vira array [{label, itens}]
  return Array.from(buckets.entries()).map(([label, itens]) => ({ label, itens }));
}

/* ===== layout – tudo aqui (css de efeito ficou no .css) ===== */
const L = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  stage: {
    position: "relative",
    width: "min(1120px, 96vw)",
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 18px 40px rgba(0,0,0,.28)",
    display: "flex",
    flexDirection: "column",
  },
  headerDate: {
    textAlign: "center",
    fontWeight: 900,
    fontSize: 22,
    color: "#1e3a8a",
    padding: "12px 16px 4px",
  },
  canvas: {
    position: "relative",
    height: "min(70vh, 640px)",
    margin: 12,
    border: "1px solid #eef2ff",
    borderRadius: 16,
    overflow: "hidden",
    background: "#fff",
  },
  card: {
    position: "absolute",
    inset: 0,
    padding: 14,
    display: "flex",
    overflow: "auto",
    background: "#fff",
    borderRadius: 14,
  },
  // seção (IATF / Pré)
  secWrap: { display: "flex", flexDirection: "column", gap: 14, width: "100%" },
  secCard: (theme) => ({
    border: `1px solid ${theme.border}`,
    borderRadius: 14,
    overflow: "hidden",
    background: theme.bg,
  }),
  secHead: (theme) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    background: theme.head,
    cursor: "pointer",
  }),
  secTitleBox: (theme) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: theme.text,
    fontWeight: 900,
    letterSpacing: 0.2,
  }),
  secBadge: (theme) => ({
    background: theme.badgeBg,
    color: theme.badgeText,
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
    fontWeight: 800,
  }),
  secBody: { padding: "10px 12px" },

  // item
  itemRow: { display: "grid", gridTemplateColumns: "16px 1fr", gap: 10, padding: "10px 0" },
  dot: (c) => ({ width: 8, height: 8, borderRadius: 999, background: c, marginTop: 8 }),
  itemTitle: { fontWeight: 800, color: "#0f172a", fontSize: 16, marginBottom: 6 },
  timeBadge: (c) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 999,
    border: `1px solid ${c}22`,
    background: `${c}10`,
    fontSize: 12,
    color: "#334155",
    marginLeft: 6,
  }),

  // animais
  animalsWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: (c) => ({
    background: "#fff",
    border: `1px solid ${c}55`,
    boxShadow: "0 1px 2px rgba(0,0,0,.06)",
    borderRadius: 12,
    padding: "8px 10px",
    display: "inline-flex",
    alignItems: "baseline",
    gap: 10,
  }),
  num: { fontWeight: 1000, fontSize: 18, lineHeight: 1.1, color: "#0f172a" },
  brinco: { fontSize: 12, color: "#64748b" },

  foot: {
    padding: "10px 14px",
    borderTop: "1px solid #eef2ff",
    display: "flex",
    justifyContent: "flex-end",
  },
  btn: {
    padding: "9px 16px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#0f172a",
    fontWeight: 900,
  },
};

// temas por seção
const THEMES = {
  IATF: {
    bg: "#f7faff",
    border: "#dbeafe",
    head: "linear-gradient(180deg,#eef4ff,#f7faff)",
    text: "#1f3fb6",
    badgeBg: "#e9eefc",
    badgeText: "#1f3fb6",
    accent: "#3b82f6",
  },
  "Pré-sincronização": {
    bg: "#fbf7ff",
    border: "#eadcff",
    head: "linear-gradient(180deg,#f5ecff,#fbf7ff)",
    text: "#6d28d9",
    badgeBg: "#efe7ff",
    badgeText: "#5b21b6",
    accent: "#8b5cf6",
  },
  Outros: {
    bg: "#f8fafc",
    border: "#e5e7eb",
    head: "linear-gradient(180deg,#f3f4f6,#f8fafc)",
    text: "#0f172a",
    badgeBg: "#e5e7eb",
    badgeText: "#111827",
    accent: "#94a3b8",
  },
};

function Section({ label, itens, getIcone }) {
  const theme = THEMES[label] || THEMES.Outros;
  const [open, setOpen] = useState(true);
  useEffect(() => setOpen(true), [label]);

  return (
    <div style={L.secCard(theme)}>
      <div style={L.secHead(theme)} onClick={() => setOpen((v) => !v)}>
        <div style={L.secTitleBox(theme)}>
          {getIcone ? (
            <img
              src={getIcone("hormonio")}
              alt=""
              style={{ width: 20, height: 20, filter: "saturate(1.2)" }}
            />
          ) : (
            <span>•</span>
          )}
          <span>{label}</span>
          <span style={L.secBadge(theme)}>{itens.length}</span>
        </div>
        <div className={"chev " + (open ? "open" : "")}>▾</div>
      </div>

      {open && (
        <div style={L.secBody}>
          {itens.map((ev, i) => (
            <div key={ev.id || i} style={{ borderBottom: "1px dashed #e5e7eb" }}>
              <div style={L.itemRow}>
                <div style={L.dot(theme.accent)} />
                <div>
                  <div style={L.itemTitle}>
                    {ev.title || "Etapa"}
                    {ev.hora ? <span style={L.timeBadge(theme.accent)}>⏰ {ev.hora}</span> : null}
                  </div>

                  {/* animais */}
                  {Array.isArray(ev.animais) && ev.animais.length > 0 && (
                    <div style={L.animalsWrap}>
                      {ev.animais.slice(0, 24).map((a, j) => (
                        <span key={a?.id || j} style={L.chip(theme.accent)} title={a?.brinco || ""}>
                          <span style={L.num}>{a?.numero ?? ""}</span>
                          {a?.brinco ? <span style={L.brinco}>{a.brinco}</span> : null}
                        </span>
                      ))}
                      {ev.animais.length > 24 && (
                        <span style={{ ...L.chip(theme.accent), fontWeight: 900 }}>
                          +{ev.animais.length - 24}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {itens.length === 0 && (
            <div style={{ color: "#64748b", padding: "10px 0 4px" }}>Nenhum item nesta seção.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RoletaModal({ initialISO, onClose, eventos, getIcone }) {
  const [currentISO, setCurrentISO] = useState(initialISO);
  const [dir, setDir] = useState(0);
  const [animating, setAnimating] = useState(false);

  // trava o fundo
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev);
  }, []);
  useEffect(() => setCurrentISO(initialISO), [initialISO]);

  // eventos → seções (IATF / Pré / Outros) com animais coalescidos
  const sections = useMemo(() => coalesceDayEvents(eventos || [], currentISO), [eventos, currentISO]);

  // teclado
  useEffect(() => {
    const onKey = (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (e.key === "Escape") onClose();
      if (animating) return;
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") go(+1);
    };
    document.addEventListener("keydown", onKey, { passive: false });
    return () => document.removeEventListener("keydown", onKey);
  }, [animating, onClose]);

  // gestos
  const startY = useRef(null), lastY = useRef(null), lastWheelAt = useRef(0);
  const onPointerDown = (e) => {
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    startY.current = y;
    lastY.current = y;
  };
  const onPointerMove = (e) => {
    if (startY.current == null || animating) return;
    lastY.current = e.touches ? e.touches[0].clientY : e.clientY;
  };
  const onPointerUp = () => {
    if (startY.current == null || animating) return;
    const delta = (lastY.current || 0) - startY.current;
    startY.current = null;
    lastY.current = null;
    if (delta < -90) go(+1);
    else if (delta > 90) go(-1);
  };
  const onWheel = (e) => {
    const now = Date.now();
    if (animating || now - lastWheelAt.current < 650) return;
    if (Math.abs(e.deltaY) < 30) return;
    lastWheelAt.current = now;
    go(e.deltaY > 0 ? +1 : -1);
  };

  function go(direction) {
    setDir(direction);
    setAnimating(true);
    setCurrentISO((prev) => addDays(prev, direction));
  }

  return (
    <div className="overlayFx" style={L.overlay} onClick={onClose}>
      <div className="stageFx" style={L.stage} onClick={(e) => e.stopPropagation()}>
        <div style={L.headerDate}>{fmtBR(currentISO)}</div>

        <div
          className="canvasFx"
          style={L.canvas}
          onWheel={onWheel}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        >
          <AnimatePresence mode="sync" initial={false} custom={dir} onExitComplete={() => setAnimating(false)}>
            <motion.div
              key={currentISO}
              className="cardFx"
              style={L.card}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: PREFERS_REDUCED ? 0.2 : DUR, ease: EASE }}
            >
              <div style={L.secWrap}>
                {sections.map((sec) => (
                  <Section key={sec.label} label={sec.label} itens={sec.itens} getIcone={getIcone} />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div style={L.foot}>
          <button style={L.btn} onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
