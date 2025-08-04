import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

function VerificarEmail() {
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/verificar', { email, codigo });
      navigate('/');
    } catch (err) {
      alert('Código inválido');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <img src="/icon.svg" alt="Logo" width={64} />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="Código"
      />
      <button type="submit">Verificar</button>
    </form>
  );
}

export default VerificarEmail;
