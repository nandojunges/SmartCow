import React from 'react';

export default function FichaAnimalEventos({ eventos = [] }) {
  if (!Array.isArray(eventos) || eventos.length === 0) {
    return (
      <p style={{ fontStyle: 'italic', color: '#777' }}>
        Sem eventos registrados.
      </p>
    );
  }

  return (
    <>
      {eventos.map((ev) => (
        <div key={ev.id} className="evento-item">
          <strong>
            {ev.dataEvento} — {ev.tipoEvento}
          </strong>
          <p>{ev.descricao}</p>
        </div>
      ))}
    </>
  );
}
