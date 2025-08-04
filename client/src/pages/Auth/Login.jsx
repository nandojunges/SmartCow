import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import jwtDecode from 'jwt-decode';
import api from '../../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
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

  return (
    <div
      style={{
        backgroundImage: "url('/telafundo.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      <div style={{
        display: 'flex',
        gap: '40px',
        flexWrap: 'wrap',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        padding: '30px',
        backdropFilter: 'blur(4px)'
      }}>
        {/* Bloco esquerdo com texto informativo */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderRadius: '15px',
          padding: '20px',
          width: '340px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <h2 style={{ marginBottom: '8px' }}>Bem-vindo ao Gestão Leiteira</h2>
          <p style={{ fontSize: '14px', textAlign: 'center' }}>
            O sistema que organiza sua fazenda de leite, com controle total de rebanho, reprodução e produtividade.
          </p>
        </div>

        {/* Bloco direito com o formulário de login */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderRadius: '15px',
          padding: '20px',
          width: '340px',
        }}>
          <h2 style={{ textAlign: 'center' }}>SmartMilk</h2>
          <p style={{ textAlign: 'center', fontWeight: 'bold', color: '#444' }}>Acesso ao Sistema</p>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', marginTop: 10, padding: 10 }}
          />

          <div style={{ position: 'relative', marginTop: 10 }}>
            <input
              type={mostrarSenha ? 'text' : 'password'}
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              style={{ width: '100%', padding: 10 }}
            />
            <div
              onClick={() => setMostrarSenha(!mostrarSenha)}
              style={{ position: 'absolute', top: 12, right: 10, cursor: 'pointer' }}
            >
              {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
            <input
              type="checkbox"
              checked={lembrar}
              onChange={(e) => setLembrar(e.target.checked)}
            />
            <span style={{ marginLeft: 8 }}>Lembrar-me</span>
          </label>

          <button
            onClick={handleLogin}
            style={{
              marginTop: 15,
              background: '#2563EB',
              color: '#fff',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              width: '100%',
              cursor: 'pointer'
            }}
          >
            Entrar
          </button>

          <div style={{ marginTop: 10, fontSize: 14 }}>
            <Link to="/recuperar">Esqueceu a senha?</Link><br />
            Não tem conta? <Link to="/cadastro">Cadastrar-se</Link>
          </div>
        </div>
      </div>

      {/* Rodapé com versão */}
      <footer style={{
        position: 'absolute',
        bottom: 10,
        width: '100%',
        textAlign: 'center',
        color: '#fff',
        fontSize: 14
      }}>
        Versão 1.0.0 | © Gestão Leiteira 2025
      </footer>
    </div>
  );
}

