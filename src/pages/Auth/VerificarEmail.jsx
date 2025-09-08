// src/pages/Auth/VerificarEmail.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { apiAuth } from '../../api'; // 👈 use o cliente correto

export default function VerificarEmail() {
  const [codigo, setCodigo] = useState('');
  const [email, setEmail] = useState('');
  const [tempo, setTempo] = useState(180); // 3 min
  const [podeReenviar, setPodeReenviar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const salvo = localStorage.getItem('emailCadastro');
    if (salvo) setEmail(salvo);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTempo((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPodeReenviar(true), 30000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (tempo === 0) toast.warn('Código expirado. Clique em Reenviar código.');
  }, [tempo]);

  const formatarTempo = (seg) => {
    const m = String(Math.floor(seg / 60)).padStart(2, '0');
    const s = String(seg % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const reenviarCodigo = async () => {
    const emailTrim = String(email || '').trim().toLowerCase();
    if (!emailTrim) return toast.error('Email não encontrado. Faça o cadastro novamente.');
    try {
      setReenviando(true);
      // ✅ cliente certo + caminho certo
      await apiAuth.post('/auth/resend', { email: emailTrim });
      setTempo(180);
      setPodeReenviar(false);
      setTimeout(() => setPodeReenviar(true), 30000);
      toast.success('Código reenviado. Verifique seu e-mail.');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erro ao reenviar código.';
      toast.error(msg);
    } finally {
      setReenviando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailTrim = String(email || '').trim().toLowerCase();
    const codeTrim = String(codigo || '').trim();
    if (!emailTrim) return toast.error('Email não encontrado. Faça o cadastro novamente.');
    if (!codeTrim) return toast.error('Informe o código recebido por e-mail.');

    setEnviando(true);
    try {
      // ✅ cliente certo + caminho certo
      await apiAuth.post('/auth/verify', { email: emailTrim, code: codeTrim });
      toast.success('E-mail verificado com sucesso!');
      navigate('/login', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Código incorreto ou expirado.';
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100%', overflow: 'hidden', margin: 0, padding: 0,
      backgroundImage: "url('/icones/telafundo.png')", backgroundSize: 'cover',
      backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
    }}>
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.85)', padding: '40px', borderRadius: '20px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)', maxWidth: '500px', width: '100%',
      }}>
        <p className="text-center mb-2">
          Enviamos um código para {email}. Isso pode levar alguns segundos...
        </p>

        {!podeReenviar && (
          <div className="flex justify-center mb-2">
            <Loader2 className="animate-spin" />
          </div>
        )}

        <div className="text-center mb-2">Tempo restante: {formatarTempo(tempo)}</div>

        {tempo === 0 && (
          <div className="text-center text-red-600 mb-2">
            Código expirado. Clique em reenviar.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            placeholder="Código"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '10px',
              border: '1px solid #ccc', backgroundColor: '#fff', fontSize: '0.95rem',
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
          />

          <button
            type="submit"
            style={{
              backgroundColor: '#1565c0', color: '#fff', borderRadius: '25px',
              padding: '10px 20px', fontWeight: 'bold', border: 'none', width: '60%',
              marginTop: '20px', marginLeft: 'auto', marginRight: 'auto',
            }}
            disabled={enviando}
            className="hover:bg-[#0d47a1] disabled:opacity-60"
          >
            {enviando ? 'Verificando...' : 'Verificar'}
          </button>
        </form>

        {podeReenviar && (
          <button
            onClick={reenviarCodigo}
            className="mt-2 text-sm text-blue-600 hover:underline disabled:opacity-60"
            disabled={reenviando}
          >
            {reenviando ? 'Reenviando...' : 'Reenviar código'}
          </button>
        )}
      </div>
    </div>
  );
}
