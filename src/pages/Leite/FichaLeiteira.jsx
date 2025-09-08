// src/pages/Leite/FichaLeiteira.jsx
import React, { useState, useEffect, useCallback } from "react";

// ✅ use os arquivos locais da pasta Leite
import AbaRegistroCMT from "./AbaCMT";
import AbaDiagnosticoMastite from "./AbaDiagnosticoMastite";
import AbaTratamentoMastite from "./AbaTratamentoMastite";
import AbaCCS from "./AbaCCS";

const estiloIcone = {
  width: "36px",
  height: "36px",
  objectFit: "contain",
};

const abasDisponiveis = [
  { id: "cmt", label: "CMT", icone: "/icones/historico.png" },
  { id: "diagnostico", label: "Diagnóstico", icone: "/icones/diagnosticogestacao.png" },
  { id: "tratamento", label: "Tratamento", icone: "/icones/tratamento.png" },
  { id: "ccs", label: "CCS", icone: "/icones/historico.png" },
];

export default function FichaLeiteira({ vaca, onFechar, abaInicial = "cmt" }) {
  const [abaAtiva, setAbaAtiva] = useState(abaInicial);

  const trocarAbaComSeta = useCallback(
    (direcao) => {
      const indexAtual = abasDisponiveis.findIndex((a) => a.id === abaAtiva);
      let novoIndex = indexAtual + direcao;
      if (novoIndex < 0) novoIndex = abasDisponiveis.length - 1;
      if (novoIndex >= abasDisponiveis.length) novoIndex = 0;
      setAbaAtiva(abasDisponiveis[novoIndex].id);
    },
    [abaAtiva]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onFechar?.();
      else if (e.key === "ArrowRight") trocarAbaComSeta(1);
      else if (e.key === "ArrowLeft") trocarAbaComSeta(-1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [trocarAbaComSeta, onFechar]);

  const renderizarAba = () => {
    switch (abaAtiva) {
      case "cmt":
        return <AbaRegistroCMT vaca={vaca} />;
      case "diagnostico":
        return <AbaDiagnosticoMastite vaca={vaca} />;
      case "tratamento":
        return <AbaTratamentoMastite vaca={vaca} />;
      case "ccs":
        return <AbaCCS vaca={vaca} />;
      default:
        return null;
    }
  };

  return (
    <div style={overlay} onClick={onFechar}>
      <div style={modal} onClick={(e) => e.stopPropagation()} tabIndex={0}>
        <div style={header}>
          🧀 Registro de Saúde da Glândula Mamária — {vaca?.numero || "?"}
          <button onClick={onFechar} style={botaoFechar}>
            ×
          </button>
        </div>

        <div style={abas}>
          {abasDisponiveis.map((aba) => (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              style={{
                padding: "0.6rem 1.4rem",
                fontWeight: "500",
                fontSize: "0.95rem",
                borderRadius: "0.75rem 0.75rem 0 0",
                background: abaAtiva === aba.id ? "#ffffff" : "#f1f5f9",
                border: "1px solid #dbeafe",
                borderBottom: abaAtiva === aba.id ? "none" : "1px solid #d1d5db",
                color: abaAtiva === aba.id ? "#1e40af" : "#6b7280",
                boxShadow: abaAtiva === aba.id ? "inset 0 2px 0 #2563eb" : "none",
                cursor: "pointer",
                transition: "all 0.2s ease-in-out",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <img src={aba.icone} alt={aba.label} style={estiloIcone} />
                <span>{aba.label}</span>
              </div>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", background: "#f9fafb" }}>
          {renderizarAba()}
        </div>
      </div>
    </div>
  );
}

/* ===== estilos ===== */
const overlay = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
};

const modal = {
  background: "#fff",
  borderRadius: "1rem",
  width: "min(90vw, 720px)",
  height: "92vh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  fontFamily: "Poppins, sans-serif",
  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
  outline: "none",
};

const header = {
  background: "#1e40af",
  color: "white",
  padding: "1rem 1.5rem",
  fontWeight: "bold",
  fontSize: "1.1rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const botaoFechar = {
  background: "none",
  border: "none",
  color: "white",
  fontSize: "1.5rem",
  cursor: "pointer",
};

const abas = {
  display: "flex",
  background: "#e0e7ff",
  paddingLeft: "1.5rem",
  paddingTop: "0.5rem",
  gap: "0.5rem",
  borderBottom: "1px solid #cbd5e1",
};
