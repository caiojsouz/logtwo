import { config } from './src/config.js';
import { initDatabase } from './src/db/index.js';
import { createApp, hasFrontend } from './src/app.js';

await initDatabase();

const app = createApp();

app.listen(config.port, () => {
  console.log(`[logtwo] API em http://localhost:${config.port} (${config.env})`);
  console.log(`[logtwo] Banco: ${config.tursoUrl.startsWith('file:') ? 'arquivo local' : 'Turso remoto'}`);
  console.log(`[logtwo] Frontend local: ${hasFrontend ? 'servido por este processo' : 'não encontrado'}`);
});
