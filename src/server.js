import app from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`Art Log is running at ${config.appUrl}`);
});
