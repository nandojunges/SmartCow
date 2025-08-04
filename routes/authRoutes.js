const router = require('express').Router();
const authController = require('../controllers/authController');

router.post('/cadastro', authController.cadastro);
router.post('/verificar', authController.verificarEmail);
router.post('/login', authController.login);
router.post('/esqueci-senha', authController.esqueciSenha);
router.post('/redefinir-senha', authController.redefinirSenha);

module.exports = router;
