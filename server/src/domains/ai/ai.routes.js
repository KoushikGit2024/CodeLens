'use strict';

const express = require('express');
const router = express.Router();
const aiController = require('./ai.controller');

// AI Proxy route
router.post('/chat', aiController.generateChat);

// AI Health check route
router.get('/health', aiController.healthCheck);

module.exports = router;
