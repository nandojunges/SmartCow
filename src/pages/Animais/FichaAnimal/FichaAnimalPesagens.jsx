import React from "react";

export default function FichaAnimalPesagens({ animal }) {
  const pesagens = Array.isArray(animal?.historico?.pesagens)
    ? animal.historico.pesagens
    : Array.isArray(animal.pesagens)
    ? animal.pesagens
    : [];

  if (pesagens.length === 0) {
    return (
      <p style={{ fontStyle: "italic", color: "#777" }}>
        Nenhuma pesagem registrada.
      </p>
    );
  }

  return (
    <ul style={{ paddingLeft: "1.2rem" }}>
      {pesagens.map((p, i) => (
        <li key={i}>
          <strong>{p.data}</strong>: {p.peso} kg
        </li>
      ))}
    </ul>
  );
}
