import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';

function Cadastro() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/cadastro', { nome, email, senha });
      navigate('/verificar', { state: { email } });
    } catch (err) {
      alert('Erro no cadastro');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <img src="/icon.svg" alt="Logo" width={64} />
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Senha"
      />
      <button type="submit">Cadastrar</button>
      <Link to="/">Voltar</Link>
    </form>
  );
}

export default Cadastro;
