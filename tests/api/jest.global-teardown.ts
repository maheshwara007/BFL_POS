import * as path from 'path';
import * as fs from 'fs';

export default async function globalTeardown() {
  const tmpPath = path.resolve(process.cwd(), '.jest-token.tmp');
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
}
