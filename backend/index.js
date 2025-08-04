const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

// Rotas
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Rota teste
app.get('/api', (req, res) => {
  res.send('✅ Backend rodando!');
});

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
});
