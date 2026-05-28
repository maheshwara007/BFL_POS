import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const Config = {
  baseUrl:   process.env.BASE_URL     || 'https://example.com',
  headless:  process.env.HEADLESS     !== 'false',
  env:       process.env.ENV          || 'qa',
};
