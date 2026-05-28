import { Page, Locator, expect } from '@playwright/test';
import { logger } from '../utils/Logger';

export class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  async navigate(url: string): Promise<void> {
    logger.info(`Navigating to: ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  async goBack(): Promise<void> {
    await this.page.goBack();
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
  }

  // ── Element Actions ──────────────────────────────────────────────────────────

  async click(locator: Locator, label = ''): Promise<void> {
    logger.info(`Clicking: ${label || locator}`);
    await locator.waitFor({ state: 'visible' });
    await locator.click();
  }

  async fill(locator: Locator, value: string, label = ''): Promise<void> {
    logger.info(`Filling "${label || locator}" with: ${value}`);
    await locator.waitFor({ state: 'visible' });
    await locator.clear();
    await locator.fill(value);
  }

  async type(locator: Locator, value: string, label = ''): Promise<void> {
    logger.info(`Typing into "${label || locator}"`);
    await locator.waitFor({ state: 'visible' });
    await locator.clear();
    await locator.pressSequentially(value, { delay: 50 });
  }

  async selectByLabel(locator: Locator, label: string): Promise<void> {
    logger.info(`Selecting option: ${label}`);
    await locator.selectOption({ label });
  }

  async selectByValue(locator: Locator, value: string): Promise<void> {
    await locator.selectOption({ value });
  }

  async check(locator: Locator): Promise<void> {
    logger.info(`Checking checkbox`);
    await locator.check();
  }

  async uncheck(locator: Locator): Promise<void> {
    await locator.uncheck();
  }

  async hover(locator: Locator): Promise<void> {
    await locator.hover();
  }

  async doubleClick(locator: Locator): Promise<void> {
    await locator.dblclick();
  }

  async rightClick(locator: Locator): Promise<void> {
    await locator.click({ button: 'right' });
  }

  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async scrollToElement(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
  }

  // ── Getters ──────────────────────────────────────────────────────────────────

  async getText(locator: Locator): Promise<string> {
    await locator.waitFor({ state: 'visible' });
    return (await locator.textContent()) ?? '';
  }

  async getValue(locator: Locator): Promise<string> {
    return locator.inputValue();
  }

  async getAttribute(locator: Locator, attr: string): Promise<string | null> {
    return locator.getAttribute(attr);
  }

  async isVisible(locator: Locator): Promise<boolean> {
    return locator.isVisible();
  }

  async isEnabled(locator: Locator): Promise<boolean> {
    return locator.isEnabled();
  }

  async isChecked(locator: Locator): Promise<boolean> {
    return locator.isChecked();
  }

  async getCount(locator: Locator): Promise<number> {
    return locator.count();
  }

  // ── Waits ────────────────────────────────────────────────────────────────────

  async waitForVisible(locator: Locator, timeout = 15_000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
  }

  async waitForHidden(locator: Locator, timeout = 15_000): Promise<void> {
    await locator.waitFor({ state: 'hidden', timeout });
  }

  async waitForUrl(urlOrPattern: string | RegExp, timeout = 30_000): Promise<void> {
    await this.page.waitForURL(urlOrPattern, { timeout });
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  // ── Assertions ───────────────────────────────────────────────────────────────

  async assertVisible(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible();
  }

  async assertHidden(locator: Locator): Promise<void> {
    await expect(locator).toBeHidden();
  }

  async assertText(locator: Locator, text: string): Promise<void> {
    await expect(locator).toHaveText(text);
  }

  async assertContainsText(locator: Locator, text: string): Promise<void> {
    await expect(locator).toContainText(text);
  }

  async assertValue(locator: Locator, value: string): Promise<void> {
    await expect(locator).toHaveValue(value);
  }

  async assertUrl(urlOrPattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(urlOrPattern);
  }

  async assertTitle(title: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(title);
  }

  async assertEnabled(locator: Locator): Promise<void> {
    await expect(locator).toBeEnabled();
  }

  async assertDisabled(locator: Locator): Promise<void> {
    await expect(locator).toBeDisabled();
  }

  async assertChecked(locator: Locator): Promise<void> {
    await expect(locator).toBeChecked();
  }

  async assertCount(locator: Locator, count: number): Promise<void> {
    await expect(locator).toHaveCount(count);
  }

  // ── Alerts / Dialogs ─────────────────────────────────────────────────────────

  async acceptAlert(): Promise<void> {
    this.page.once('dialog', dialog => dialog.accept());
  }

  async dismissAlert(): Promise<void> {
    this.page.once('dialog', dialog => dialog.dismiss());
  }

  // ── Frames ───────────────────────────────────────────────────────────────────

  getFrame(nameOrUrl: string) {
    return this.page.frame(nameOrUrl);
  }

  getFrameLocator(selector: string) {
    return this.page.frameLocator(selector);
  }

  // ── Screenshot ───────────────────────────────────────────────────────────────

  async screenshot(name: string): Promise<void> {
    const filePath = `reports/screenshots/${name}-${Date.now()}.png`;
    await this.page.screenshot({ path: filePath, fullPage: true });
    logger.info(`Screenshot saved: ${filePath}`);
  }
}
