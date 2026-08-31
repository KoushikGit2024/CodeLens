const { Router } = require('express');
const { isProviderConfigured, getProviderName } = require('../../core/ai/ai.provider');

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'codelens-server', timestamp: new Date().toISOString() });
});

router.get('/ai', (_req, res) => {
  const configured = isProviderConfigured();
  const provider = getProviderName();
  res.json({ configured, provider });
});

module.exports = router;
