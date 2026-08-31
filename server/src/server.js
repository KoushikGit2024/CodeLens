require('dotenv').config();
const app = require('./app');
const { isProviderConfigured, verifyProviderConnection } = require('./core/ai/ai.provider');

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`[CodeLens] Server running on http://localhost:${PORT}`);
  
  if (isProviderConfigured()) {
    let providerName = 'Unknown';
    if (process.env.GEMINI_API_KEY) providerName = 'Google Gemini';
    else if (process.env.OPENAI_API_KEY) providerName = 'OpenAI-Compatible';
    else if (process.env.IBM_API_KEY && process.env.IBM_PROJECT_ID) providerName = 'IBM watsonx';

    // console.log(`[CodeLens] ⏳ Verifying connection to ${providerName}...`);
    // const isConnected = await verifyProviderConnection();
    // 
    // if (isConnected) {
    //   console.log(`[CodeLens] ✅ AI Provider Online: ${providerName}`);
    // } else {
    //   console.log(`[CodeLens] ❌ AI Provider Failed: ${providerName} (Check your API key/network)`);
    // }
  } else {
    console.log(`[CodeLens] ⚪ AI Provider: None (Offline Mode)`);
  }
});
