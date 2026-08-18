import app from './app.js';
import { config } from './config.js';
import { migrateDatabase } from '../database/migrate.js';

await migrateDatabase();

app.listen(config.port, () => {
  console.log(`Art Log is running at ${config.appUrl}`);
});
