const express = require('express');
const router = express.Router();
const { enviarCodigo, verificarCodigo } = require('../controllers/authController');

// Compatível com chamadas do frontend
router.post('/enviar-codigo', enviarCodigo);
router.post('/verificar-codigo', verificarCodigo);

module.exports = router;
