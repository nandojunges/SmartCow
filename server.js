require('dotenv').config();
const express = require('express');
const app = express();
const { sequelize } = require('./config/db');

// Import models to ensure they are registered with Sequelize
require('./models/Usuario');
require('./models/Animal');
require('./models/TokenRecuperacao');

const authRoutes = require('./routes/authRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const animalRoutes = require('./routes/animalRoutes');

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/animais', animalRoutes);

const PORT = process.env.PORT || 3000;

sequelize
  .sync()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
  })
  .catch((err) => {
    console.error('Erro ao conectar ao banco:', err);
  });
