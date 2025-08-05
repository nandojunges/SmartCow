import { useState } from 'react';
import api from '../api';

export default function VerificacaoEmail({ email, setEmail, onEmailVerificado }) {
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [verificado, setVerificado] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(false);

  const enviarCodigo = async () => {
    setMensagem('');
    setCarregando(true);
    try {
      await api.post('/auth/enviar-codigo', { email });
      setCodigoEnviado(true);
      setMensagem('📩 Código enviado! Verifique seu e-mail.');
    } catch (error) {
      setMensagem(error.response?.data?.erro || 'Erro ao enviar código');
    }
    setCarregando(false);
  };

  const verificarCodigo = async () => {
    setMensagem('');
    setCarregando(true);
    try {
      await api.post('/auth/verificar-codigo', { email, codigo });
      setVerificado(true);
      onEmailVerificado(true);
      setMensagem('✅ Email verificado com sucesso!');
    } catch (error) {
      setMensagem(error.response?.data?.erro || 'Erro ao verificar código');
    }
    setCarregando(false);
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <label>E-mail:</label>
      <input
        type='email'
        value={email}
        disabled={verificado}
        onChange={(e) => setEmail(e.target.value)}
        placeholder='seuemail@email.com'
      />
      {!codigoEnviado && (
        <button type='button' onClick={enviarCodigo} disabled={!email || carregando}>
          {carregando ? 'Enviando...' : 'Enviar Código'}
        </button>
      )}
      {codigoEnviado && !verificado && (
        <>
          <input
            type='text'
            placeholder='Digite o código'
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            maxLength={6}
          />
          <button type='button' onClick={verificarCodigo} disabled={!codigo || carregando}>
            {carregando ? 'Verificando...' : 'Verificar'}
          </button>
        </>
      )}
      {mensagem && <p style={{ marginTop: 10 }}>{mensagem}</p>}
      {verificado && <p style={{ color: 'green' }}>✅ Email verificado</p>}
    </div>
  );
}

