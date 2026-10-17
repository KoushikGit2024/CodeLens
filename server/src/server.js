require('dotenv').config();
const app = require('./app');
const { isProviderConfigured, getProviderName, verifyProviderConnection } = require('./core/ai/ai.provider');

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`[CodeLens] Server running on http://localhost:${PORT}`);

  if (isProviderConfigured()) {
    const providerName = getProviderName();
    console.log(`[CodeLens] AI Provider: ${providerName}`);
  } else {
    console.log(`[CodeLens] ⚪ AI Provider: None (Offline Mode)`);
  }
});
