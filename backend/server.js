const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();

app.use(cors());
app.use(express.json());

// Rota de autenticação
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

// Demais rotas...

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
