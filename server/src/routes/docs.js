const { Router } = require('express');
const { getDoc } = require('../controllers/docsController');

const router = Router();

router.get('/', getDoc);

module.exports = router;
