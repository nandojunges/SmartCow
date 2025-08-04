const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

app.get('/api', (req, res) => {
  res.send('✅ Backend está rodando!');
});

app.post('/api/auth/cadastrar', (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Dados incompletos' });
  }
  console.log('📦 Novo cadastro:', req.body);
  res.status(200).json({ mensagem: 'Cadastro realizado com sucesso!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
});
