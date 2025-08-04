import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import jwtDecode from 'jwt-decode';
import api from '../../api';

// Placeholder: substitua pelo componente real quando estiver disponível
const LoginInfoRotativo = () => <div />;

function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    const salvo = localStorage.getItem('rememberedEmail');
    if (salvo) {
      setEmail(salvo);
      setLembrar(true);
    }
  }, []);

  const validar = () => {
    const e = {};
    if (!email) e.email = 'Informe o email';
    if (!senha) e.senha = 'Informe a senha';
    setErrors(e);
    return Object.keys(e).length === 0;
    };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validar()) return;
    try {
      const { data } = await api.post('/auth/login', { email, senha });
      localStorage.setItem('token', data.token);
      if (lembrar) localStorage.setItem('rememberedEmail', email);
      else localStorage.removeItem('rememberedEmail');
      const user = jwtDecode(data.token);
      navigate(user?.perfil === 'admin' ? '/admin' : '/inicio');
    } catch {
      setErrors({ form: 'Credenciais inválidas' });
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundImage: "url('/icones/telafundo.png')",
        backgroundSize: 'cover',
        fontFamily: 'Poppins',
      }}
    >
      <header
        style={{
          textAlign: 'center',
          padding: '24px 0',
          backgroundColor: 'rgba(255,255,255,0.7)',
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>
          SmartMilk - GESTÃO LEITEIRA
        </h1>
        <p style={{ fontSize: '20px', fontFamily: 'Dancing Script' }}>
          Bem-vindo
        </p>
      </header>
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '32px',
          padding: '16px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            backgroundColor: 'rgba(255,255,255,0.7)',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            maxWidth: '300px',
            width: '100%',
          }}
        >
          <LoginInfoRotativo />
        </motion.div>
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            backgroundColor: 'rgba(255,255,255,0.8)',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            width: '100%',
            maxWidth: '320px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #ccc',
              }}
            />
            {errors.email && (
              <p style={{ color: 'red', fontSize: '12px' }}>{errors.email}</p>
            )}
          </div>
          <div>
            <div style={{ position: 'relative' }}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Senha"
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 10px',
                  borderRadius: '8px',
                  border: '1px solid #ccc',
                }}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((s) => !s)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.senha && (
              <p style={{ color: 'red', fontSize: '12px' }}>{errors.senha}</p>
            )}
          </div>
          {errors.form && (
            <p style={{ color: 'red', fontSize: '12px', textAlign: 'center' }}>
              {errors.form}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '14px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(e) => setLembrar(e.target.checked)}
              />
              Lembrar-me
            </label>
            <Link to="/recuperar">esqueceu a senha?</Link>
          </div>
          <button
            type="submit"
            style={{
              background: 'linear-gradient(90deg,#4facfe,#00f2fe)',
              color: '#fff',
              padding: '10px',
              border: 'none',
              borderRadius: '9999px',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            Entrar
          </button>
          <p style={{ textAlign: 'center', fontSize: '14px' }}>
            Não tem conta? <Link to="/escolher-plano">Cadastre-se</Link>
          </p>
        </motion.form>
      </main>
      <footer
        style={{
          textAlign: 'center',
          padding: '16px 0',
          backgroundColor: 'rgba(255,255,255,0.7)',
          fontSize: '14px',
        }}
      >
        Versão 1.0.0 | © Gestão Leiteira 2025
      </footer>
    </div>
  );
}

export default Login;
