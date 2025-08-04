const router = require('express').Router();
const usuarioController = require('../controllers/usuarioController');
const auth = require('../middleware/authMiddleware');

router.get('/me', auth, usuarioController.me);

module.exports = router;
