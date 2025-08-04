import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Auth/Login';
import Cadastro from './pages/Auth/Cadastro';
import VerificarCodigo from './pages/Auth/VerificarCodigo';
import EsqueciSenha from './pages/Auth/EsqueciSenha';
import Logout from './pages/Auth/Logout';
import EscolherPlanoCadastro from './pages/Auth/EscolherPlanoCadastro';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/escolher-plano" element={<EscolherPlanoCadastro />} />
        <Route path="/verificar-codigo" element={<VerificarCodigo />} />
        <Route path="/recuperar" element={<EsqueciSenha />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/dashboard" element={<div>Login funcionou</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
