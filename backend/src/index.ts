import 'dotenv/config';
import { createApp } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = createApp();
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Dhaka Tesla Pool API listening on port ${PORT}`);
});
