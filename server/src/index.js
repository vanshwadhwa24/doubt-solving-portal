import { createApp } from './app.js';
import { config } from './config.js';
import { startTelegramBot } from './telegram.js';

const app = createApp();
startTelegramBot().catch((err) => console.error('telegram bot disabled:', err.message));
app.listen(config.port, () => {
  console.log(`doubt-portal server listening on http://localhost:${config.port}`);
});
