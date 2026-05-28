import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export async function takeScreenshot(page: Page, name: string): Promise<void> {
  const dir = path.resolve(__dirname, '../reports/screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

export function randomString(length = 8): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

export function randomEmail(): string {
  return `test_${randomString()}@qa.com`;
}

export async function waitForNetworkIdle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}
