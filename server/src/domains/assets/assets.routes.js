'use strict';

const express = require('express');
const { getUploadAuth } = require('./assets.controller');
const authMiddleware = require('../../core/auth/auth.middleware');

const router = express.Router();

router.get('/auth', authMiddleware, getUploadAuth);

module.exports = router;
