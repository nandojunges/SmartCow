import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import jwtDecode from 'jwt-decode';
import api from '../../api';
import FrasesRotativas from '../../components/FrasesRotativas';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/auth/login', { email, senha });
      const token = response.data.token;
      localStorage.setItem('token', token);
      const decoded = jwtDecode(token);
      localStorage.setItem('user', JSON.stringify(decoded));
      navigate('/dashboard');
    } catch (error) {
      alert('Erro ao fazer login. Verifique suas credenciais.');
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #ccc',
  };

  const iconButtonStyle = {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: "url('/icones/telafundo.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        margin: 0,
        padding: 0,
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          backgroundColor: 'rgba(255,255,255,0.85)',
          padding: '40px',
          borderRadius: '20px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
          maxWidth: '400px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h2 style={{ textAlign: 'center' }}>SmartMilk</h2>
        <p className="text-center text-sm text-gray-600">Bem-vindo ao Gestão Leiteira</p>
        <FrasesRotativas />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          style={inputStyle}
        />
        <div style={{ position: 'relative' }}>
          <input
            type={mostrarSenha ? 'text' : 'password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            style={{ ...inputStyle, paddingRight: '40px' }}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((s) => !s)}
            style={iconButtonStyle}
          >
            {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <input
            type="checkbox"
            checked={lembrar}
            onChange={(e) => setLembrar(e.target.checked)}
          />
          <span>Lembrar-me</span>
        </label>
        <button
          type="submit"
          style={{
            backgroundColor: '#1e3a8a',
            color: '#fff',
            border: 'none',
            borderRadius: '30px',
            padding: '10px',
            width: '60%',
            margin: '20px auto 0',
            cursor: 'pointer',
            transition: 'background 0.3s',
          }}
          onMouseEnter={(e) => (e.target.style.backgroundColor = '#2563eb')}
          onMouseLeave={(e) => (e.target.style.backgroundColor = '#1e3a8a')}
        >
          Entrar
        </button>
        <div style={{ textAlign: 'center', fontSize: '14px' }}>
          <Link to="/recuperar">Esqueceu a senha?</Link>
          <br />
          Não tem conta? <Link to="/cadastro">Cadastrar-se</Link>
        </div>
      </form>
    </div>
  );
}

