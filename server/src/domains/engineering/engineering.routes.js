const { Router } = require('express');

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'codelens-server', timestamp: new Date().toISOString() });
});

router.get('/ai', (_req, res) => {
  const configured = !!process.env.WATSONX_API_KEY && !!process.env.WATSONX_PROJECT_ID;
  res.json({ configured, provider: 'watsonx' });
});

module.exports = router;
