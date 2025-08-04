const router = require('express').Router();
const animalController = require('../controllers/animalController');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');

router.get('/', auth, animalController.list);
router.get('/:id', auth, animalController.get);
router.post('/', auth, animalController.create);
router.put('/:id', auth, animalController.update);
router.delete('/:id', auth, admin, animalController.remove);

module.exports = router;
