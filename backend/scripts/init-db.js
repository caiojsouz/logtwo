import { config } from '../src/config.js';
import { initDatabase } from '../src/db/index.js';

await initDatabase();
console.log(`Schema aplicado em ${config.tursoUrl.startsWith('file:') ? 'banco local' : 'Turso remoto'}.`);
