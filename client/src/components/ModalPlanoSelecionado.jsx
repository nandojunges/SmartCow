import { useState } from 'react';

function ModalPlanoSelecionado({ plano, finalizar, onClose }) {
  const [formaPagamento, setFormaPagamento] = useState('cartao');

  const handleConfirmar = () => {
    finalizar(formaPagamento);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          padding: '20px',
          borderRadius: '10px',
          width: '90%',
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h2 style={{ textAlign: 'center' }}>{plano.nome}</h2>
        <p style={{ textAlign: 'center', fontWeight: 'bold' }}>{plano.preco}</p>
        <select
          value={formaPagamento}
          onChange={(e) => setFormaPagamento(e.target.value)}
          style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ccc' }}
        >
          <option value="cartao">Cartão de crédito</option>
          <option value="boleto">Boleto</option>
          <option value="pix">Pix</option>
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="botao-cancelar" onClick={onClose}>
            Cancelar
          </button>
          <button className="botao-acao" onClick={handleConfirmar}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModalPlanoSelecionado;
