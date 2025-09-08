// src/pages/Leite/GuiaMastite.jsx
import React, { useEffect, useMemo, useState } from "react";

/** ------------------ Base de conteúdo estruturada ------------------ **/
const AGENTES = [
  {
    id: "s_aureus",
    nome: "Staphylococcus aureus",
    tipo: "Contagiosa",
    severidade: "Média–Alta",
    bullets: [
      "Mastite crônica; grumos persistentes no leite",
      "Quarto endurecido; abscessos dificultam antibiótico",
      "Queda de produção; em casos graves, necrose"
    ],
    tratamento: "Cloxacilina ou Cefquinoma; resposta variável; considerar descarte em crônicos.",
    detalhes:
      "Agente contagioso típico de mastites crônicas. O leite pode conter grumos persistentes e o quarto mamário torna-se endurecido com o tempo. Comum em vacas com vários partos. Forma abscessos que dificultam a ação de antibióticos, reduzindo a taxa de cura. Pode haver baixa produção e, em casos graves, necrose do tecido mamário. Tratamento com Cloxacilina ou Cefquinoma pode ajudar, mas muitas vezes o descarte é indicado."
  },
  {
    id: "s_agalactiae",
    nome: "Streptococcus agalactiae",
    tipo: "Contagiosa",
    severidade: "Média",
    bullets: [
      "Muitas vezes subclínica com CCS alta",
      "Transmissão na ordenha; leite quase normal",
      "Boa resposta a Penicilinas"
    ],
    tratamento: "Penicilinas; tratar animais positivos e controlar contágio na ordenha.",
    detalhes:
      "Frequentemente assintomático, mas com CCS elevada. O leite parece normal ou com flocos finos. Bastante responsivo a Penicilinas. A infecção é contagiosa, transmitida facilmente durante a ordenha. Exige tratamento de todo o rebanho infectado."
  },
  {
    id: "e_coli",
    nome: "Escherichia coli",
    tipo: "Ambiental",
    severidade: "Alta",
    bullets: [
      "Mastite aguda, febre e toxemia",
      "Leite aquoso, com sangue ou pus",
      "Requer ação rápida e suporte sistêmico"
    ],
    tratamento:
      "Ceftiofur/Enrofloxacina (sistêmico), fluidoterapia e AINE; manejo higiênico rigoroso.",
    detalhes:
      "Causa mastite ambiental aguda. A vaca pode apresentar febre, anorexia, toxemia e até morte súbita. O leite pode ser aquoso, com sangue ou pus. Requer ação rápida com antibióticos sistêmicos (Ceftiofur, Enrofloxacina), fluidoterapia e anti-inflamatórios."
  },
  {
    id: "klebsiella",
    nome: "Klebsiella spp.",
    tipo: "Ambiental",
    severidade: "Alta",
    bullets: [
      "Quadro grave semelhante à E. coli",
      "Leite com odor forte e coágulos grossos",
      "Prognóstico frequentemente reservado"
    ],
    tratamento:
      "Suporte intensivo; resposta antimicrobiana limitada; prevenção ambiental é chave.",
    detalhes:
      "Mastite grave e semelhante à E. coli, porém mais resistente ao tratamento. Leite com odor forte, aspecto cremoso, presença de coágulos grossos e coloração amarelada ou marrom. O quarto mamário incha rapidamente. O prognóstico é reservado."
  },
  {
    id: "candida",
    nome: "Candida spp.",
    tipo: "Fungo/Alga",
    severidade: "Crônica",
    bullets: [
      "Associada a uso excessivo de antibiótico",
      "Leite com flocos/granuloso",
      "Não responde a antibióticos"
    ],
    tratamento:
      "Suspender antibióticos; tratar suporte; avaliar descarte do quarto/animal em crônicos.",
    detalhes:
      "Agente fúngico, associado ao uso excessivo de antibióticos. O leite apresenta flocos, grumos pequenos e aparência granulosa. Não responde a antibióticos. Mastite crônica, com endurecimento do quarto. Recomenda-se cessar antibióticos e avaliar descarte."
  },
  {
    id: "prototheca",
    nome: "Prototheca spp.",
    tipo: "Fungo/Alga",
    severidade: "Crônica",
    bullets: [
      "Alga; mastite persistente e incurável",
      "Leite normal ou levemente aquoso; CCS muito alta",
      "Atrofia do tecido mamário"
    ],
    tratamento: "Sem cura efetiva; descarte geralmente indicado.",
    detalhes:
      "Alga que causa mastite crônica, persistente e incurável. O leite tem aparência normal ou levemente aquosa, com CCS muito alta. O tecido mamário se atrofia com o tempo. O tratamento é ineficaz. Descarte é a única solução viável."
  },
  {
    id: "s_uberis_dys",
    nome: "Streptococcus uberis / dysgalactiae",
    tipo: "Ambiental",
    severidade: "Baixa–Média",
    bullets: [
      "Subclínica/leve; higiene do ambiente é chave",
      "Grumos leves; resposta boa a beta-lactâmicos",
      "Controle com cama seca e rotina"
    ],
    tratamento:
      "Amoxicilina/Cefalosporinas conforme sensibilidade; manejo higiênico.",
    detalhes:
      "Mastite ambiental subclínica ou leve. O leite pode ter grumos leves ou aspecto levemente alterado. Boa resposta a antibióticos como Amoxicilina e Cefalosporinas. Controle exige higiene e ambiente seco."
  },
  {
    id: "c_bovis",
    nome: "Corynebacterium bovis",
    tipo: "Ambiental",
    severidade: "Baixa",
    bullets: [
      "Indicador de falha na vedação do teto",
      "Leite normalmente sem alterações visuais",
      "CCS moderada; pode predispor a outras infecções"
    ],
    tratamento: "Ajustar rotina e teteiras; geralmente manejo resolve.",
    detalhes:
      "Geralmente inofensivo, mas indica falha na vedação do canal do teto. O leite não apresenta alterações visuais. CCS moderadamente elevada. Pode predispor à infecção secundária. Melhoria na ordenha resolve a maioria dos casos."
  },
  {
    id: "pseudomonas",
    nome: "Pseudomonas aeruginosa",
    tipo: "Ambiental",
    severidade: "Alta/Resistente",
    bullets: [
      "Resistente; secreção esverdeada/azulada",
      "Mau cheiro; pode haver toxemia",
      "Evitar soluções/seringas contaminadas"
    ],
    tratamento:
      "Resposta antimicrobiana limitada; foco em prevenção e biossegurança.",
    detalhes:
      "Bactéria resistente e grave. Leite com mau cheiro, secreção esverdeada ou azulada. Pode haver febre e toxemia. Resposta a antibióticos é limitada. Evitar reutilização de seringas ou soluções contaminadas."
  },
  {
    id: "mycoplasma",
    nome: "Mycoplasma spp.",
    tipo: "Contagiosa",
    severidade: "Alta",
    bullets: [
      "Altamente contagiosa e refratária",
      "Leite aguado; vários quartos acometidos",
      "Pode cursar com artrite/pneumonia"
    ],
    tratamento: "Sem cura confiável; isolamento/descarte.",
    detalhes:
      "Mastite altamente contagiosa e refratária. Leite aguado, com queda de produção severa e envolvimento de vários quartos. Pode vir acompanhada de artrite ou pneumonia. Sem cura, exige isolamento ou descarte."
  },
  {
    id: "serratia",
    nome: "Serratia spp.",
    tipo: "Ambiental",
    severidade: "Média",
    bullets: [
      "Quadros crônicos; coloração do leite alterada",
      "Resposta terapêutica baixa",
      "Controle ambiental essencial"
    ],
    tratamento: "Reforço de higiene/ambiente; terapia guiada por cultura.",
    detalhes:
      "Causa quadros crônicos, com secreção densa e alterações na coloração do leite (rosada, esverdeada). Baixa resposta terapêutica. Controle ambiental e higiene são essenciais."
  },
  {
    id: "nocardia",
    nome: "Nocardia spp.",
    tipo: "Ambiental",
    severidade: "Alta/Crônica",
    bullets: [
      "Granulomatosa; nódulos palpáveis",
      "Leite com pus espesso",
      "Geralmente refratária a tratamento"
    ],
    tratamento: "Sem resposta consistente; descarte costuma ser necessário.",
    detalhes:
      "Rara, mas grave. Causa mastite granulomatosa com nódulos palpáveis. Leite com pus espesso. Sem resposta a antibióticos. Normalmente exige descarte do animal."
  },
  {
    id: "aspergillus",
    nome: "Aspergillus spp.",
    tipo: "Fungo/Alga",
    severidade: "Crônica",
    bullets: [
      "Feno mofado; grumos pretos/arenosos",
      "Glândula endurecida e dolorida",
      "Não responde a antibióticos"
    ],
    tratamento: "Prevenção ambiental; sem terapia antibiótica efetiva.",
    detalhes:
      "Fungo ambiental encontrado em fenos mofados. O leite pode conter grumos pretos ou arenosos. A glândula apresenta endurecimento e dor. Sem resposta a antibióticos. Prevenção com manejo adequado do ambiente."
  }
];

/** ------------------ Componente ------------------ **/
export default function GuiaMastite({ onFechar }) {
  const [q, setQ] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [expand, setExpand] = useState({}); // {id: bool}

  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onFechar?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onFechar]);

  const tipos = ["Todos", "Contagiosa", "Ambiental", "Fungo/Alga"];
  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return AGENTES.filter((a) => {
      const byTipo = filtroTipo === "Todos" || a.tipo === filtroTipo;
      const byTexto =
        !texto ||
        a.nome.toLowerCase().includes(texto) ||
        a.bullets.join(" ").toLowerCase().includes(texto) ||
        a.detalhes.toLowerCase().includes(texto);
      return byTipo && byTexto;
    });
  }, [q, filtroTipo]);

  return (
    <div style={styles.overlay} onClick={onFechar}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho compacto fixo */}
        <div style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>📘</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                Guia Clínico de Mastite
              </div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                Busca rápida, filtros e cartões resumidos
              </div>
            </div>
          </div>
          <button onClick={onFechar} style={styles.closeBtn} aria-label="Fechar">×</button>
        </div>

        {/* Filtros */}
        <div style={styles.toolbar}>
          <input
            type="text"
            placeholder="Buscar por agente, sinal, terapia…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={styles.search}
          />
          <div style={styles.pills}>
            {tipos.map((t) => (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                style={{
                  ...styles.pill,
                  background: filtroTipo === t ? "#1e40af" : "#eef2ff",
                  color: filtroTipo === t ? "#fff" : "#1e40af",
                  borderColor: "#c7d2fe"
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de cartões */}
        <div style={styles.grid}>
          {filtrados.map((a) => {
            const aberto = !!expand[a.id];
            return (
              <div key={a.id} style={styles.card}>
                <div style={styles.cardHead}>
                  <div>
                    <div style={styles.nome}>{a.nome}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <Badge>{a.tipo}</Badge>
                      <Badge tone="amber">Severidade: {a.severidade}</Badge>
                    </div>
                  </div>
                </div>

                <ul style={styles.list}>
                  {a.bullets.map((b, i) => (
                    <li key={i} style={styles.li}>• {b}</li>
                  ))}
                </ul>

                {a.tratamento && (
                  <div style={styles.tratamento}>
                    <strong>Tratamento/Conduta:</strong> {a.tratamento}
                  </div>
                )}

                {/* Detalhes colapsáveis */}
                {aberto ? (
                  <div style={styles.detalhes}>
                    {a.detalhes}
                  </div>
                ) : null}

                <div style={styles.cardFooter}>
                  <button
                    onClick={() => setExpand((e) => ({ ...e, [a.id]: !aberto }))}
                    style={styles.linkBtn}
                  >
                    {aberto ? "Ocultar detalhes" : "Ver detalhes"}
                  </button>
                </div>
              </div>
            );
          })}
          {filtrados.length === 0 && (
            <div style={{ gridColumn: "1 / -1", color: "#64748b", fontStyle: "italic" }}>
              Nenhum agente encontrado para os filtros/busca.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ------------------ UI helpers ------------------ **/
function Badge({ children, tone = "indigo" }) {
  const palette = {
    indigo: { bg: "#eef2ff", fg: "#1e40af", bd: "#c7d2fe" },
    amber: { bg: "#fffbeb", fg: "#92400e", bd: "#fcd34d" }
  };
  const c = palette[tone] || palette.indigo;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        color: c.fg
      }}
    >
      {children}
    </span>
  );
}

/** ------------------ Styles (inline) ------------------ **/
const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999
  },
  modal: {
    background: "#fff",
    width: "min(1100px, 96vw)",
    maxHeight: "92vh",
    borderRadius: 14,
    overflow: "hidden",
    fontFamily: "Poppins, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
    display: "flex",
    flexDirection: "column"
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "linear-gradient(180deg, #f8fafc, #ffffff)",
    borderBottom: "1px solid #e2e8f0",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },
  closeBtn: {
    background: "none",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    width: 36,
    height: 36,
    fontSize: 22,
    lineHeight: "32px",
    cursor: "pointer",
    color: "#0f172a"
  },
  toolbar: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #eef2f7"
  },
  search: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "0 12px",
    fontSize: 14
  },
  pills: { display: "flex", gap: 8 },
  pill: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 13,
    cursor: "pointer"
  },
  grid: {
    padding: 16,
    display: "grid",
    gap: 14,
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    overflowY: "auto"
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "start" },
  nome: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  list: { margin: "4px 0 0 0", paddingLeft: 16, lineHeight: 1.5, color: "#111827" },
  li: { marginBottom: 4 },
  tratamento: {
    fontSize: 13,
    padding: "8px 10px",
    background: "#f8fafc",
    borderRadius: 8,
    border: "1px dashed #e2e8f0",
    color: "#0f172a"
  },
  detalhes: {
    fontSize: 13,
    color: "#0f172a",
    lineHeight: 1.6,
    background: "#fcfcff",
    border: "1px solid #eef2ff",
    borderRadius: 8,
    padding: 10
  },
  cardFooter: { display: "flex", justifyContent: "flex-end" },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#1e40af",
    cursor: "pointer",
    fontWeight: 600
  }
};
