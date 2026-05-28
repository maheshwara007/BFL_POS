import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { HomeLocators } from '../locators/HomeLocators';
import { logger } from '../utils/Logger';

export class HomePage extends BasePage {
  private loc: ReturnType<typeof HomeLocators>;

  constructor(page: Page) {
    super(page);
    this.loc = HomeLocators(page);
  }

  async logout(): Promise<void> {
    logger.info('Opening menu and logging out');
    await this.click(this.loc.profileMenu, 'Burger Menu');
    await this.click(this.loc.logoutButton, 'Logout');
  }

  async getWelcomeText(): Promise<string> {
    return this.getText(this.loc.welcomeMessage);
  }

  async isNavBarVisible(): Promise<boolean> {
    return this.isVisible(this.loc.navBar);
  }

  async assertHomePageLoaded(): Promise<void> {
    await this.assertVisible(this.loc.navBar);
    await this.assertVisible(this.loc.welcomeMessage);
  }
}
