'use strict';

const express = require('express');
const router = express.Router();
const aiController = require('./ai.controller');
const authMiddleware = require('../../core/auth/auth.middleware');
const quotaMiddleware = require('../../core/auth/quota.middleware');
const { aiRateLimiter } = require('../../core/middleware/rate-limit.middleware');

// AI Proxy route — now requires a valid Supabase session and available quota.
router.post('/chat', aiRateLimiter, authMiddleware, quotaMiddleware, aiController.generateChat);

// AI Health check route — stays public (server-level health, not user-scoped).
router.get('/health', aiController.healthCheck);

// New: auth-aware status endpoint for the client AI state machine (Phase 5).
router.get('/status', authMiddleware, aiController.statusCheck);

// New: Async job polling endpoint
router.get('/job/:jobId', authMiddleware, aiController.getJobStatus);

module.exports = router;
