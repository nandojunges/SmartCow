require('dotenv').config();
const express = require('express');
const app = express();
const { sequelize } = require('./config/db');

// Importar modelos para registrar no Sequelize
require('./models/Usuario');
require('./models/Animal');
require('./models/TokenRecuperacao');

// Importar rotas
const authRoutes = require('./routes/authRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const animalRoutes = require('./routes/animalRoutes');

app.use(express.json());

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/animais', animalRoutes);

// Rota raiz de teste
app.get('/', (req, res) => {
  res.send('🚀 Backend SmartCow está funcionando!');
});

// Iniciar o servidor
const PORT = process.env.PORT || 3001;

sequelize
  .sync()
  .then(() => {
    console.log('📦 Banco de dados conectado com sucesso!');
    app.listen(PORT, () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar ao banco:', err);
  });
