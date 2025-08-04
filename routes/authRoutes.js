const router = require('express').Router();
const authController = require('../controllers/authController');

// Registration endpoint (alias for existing cadastro route)
router.post('/register', authController.cadastro);
router.post('/cadastro', authController.cadastro);
router.post('/verificar', authController.verificarEmail);
router.post('/login', authController.login);
router.post('/esqueci-senha', authController.esqueciSenha);
router.post('/redefinir-senha', authController.redefinirSenha);

module.exports = router;
