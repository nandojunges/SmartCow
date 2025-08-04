import { useState } from 'react';
import api from '../../services/api';

function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [step, setStep] = useState(1);

  const solicitar = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/esqueci-senha', { email });
      setStep(2);
    } catch (err) {
      alert('Erro ao enviar código');
    }
  };

  const redefinir = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/redefinir-senha', { email, codigo, novaSenha: senha });
      setStep(1);
      setEmail('');
      setCodigo('');
      setSenha('');
      alert('Senha redefinida');
    } catch (err) {
      alert('Erro ao redefinir');
    }
  };

  return step === 1 ? (
    <form onSubmit={solicitar}>
      <img src="/icon.svg" alt="Logo" width={64} />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <button type="submit">Enviar código</button>
    </form>
  ) : (
    <form onSubmit={redefinir}>
      <img src="/icon.svg" alt="Logo" width={64} />
      <input
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="Código"
      />
      <input
        type="password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Nova senha"
      />
      <button type="submit">Redefinir senha</button>
    </form>
  );
}

export default EsqueciSenha;
