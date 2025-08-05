const express = require('express');
const router = express.Router();
const { cadastro, verificarEmail } = require('../controllers/authController');

router.post('/cadastro', cadastro);
router.post('/verificarEmail', verificarEmail);

module.exports = router;
