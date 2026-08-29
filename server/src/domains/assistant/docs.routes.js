const { Router } = require('express');
const { getDoc } = require('./docs.controller');

const router = Router();

router.get('/', getDoc);

module.exports = router;
