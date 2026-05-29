import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await createApp(config);

app.listen(config.port, () => {
  console.log(`OpenAI image approval proxy listening on http://localhost:${config.port}`);
  if (config.requireApproval) {
    console.log('Image approval is enabled.');
  }
  if (!config.adminToken) {
    console.warn('IMAGE_PROXY_ADMIN_TOKEN is not set; admin endpoints are unprotected.');
  }
});
