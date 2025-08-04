const express = require('express');
const router = express.Router();
const {
  enviarCodigo,
  verificarCodigoHandler,
  cadastrar
} = require('../controllers/authController');

router.post('/enviar-codigo', enviarCodigo);
router.post('/verificar-codigo', verificarCodigoHandler);
router.post('/cadastrar', cadastrar);

module.exports = router;
