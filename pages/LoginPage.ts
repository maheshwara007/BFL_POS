import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { LoginLocators } from '../locators/LoginLocators';
import { logger } from '../utils/Logger';

export class LoginPage extends BasePage {
  private loc: ReturnType<typeof LoginLocators>;

  constructor(page: Page) {
    super(page);
    this.loc = LoginLocators(page);
  }

  async open(baseUrl: string): Promise<void> {
    // SauceDemo login is at the root; adjust path for your app (e.g., /login)
    await this.navigate(baseUrl);
  }

  async enterUsername(username: string): Promise<void> {
    await this.fill(this.loc.usernameInput, username, 'Username');
  }

  async enterPassword(password: string): Promise<void> {
    await this.fill(this.loc.passwordInput, password, 'Password');
  }

  async clickLogin(): Promise<void> {
    await this.click(this.loc.loginButton, 'Login Button');
  }

  async login(username: string, password: string): Promise<void> {
    logger.info(`Logging in as: ${username}`);
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.clickLogin();
  }

  async clickForgotPassword(): Promise<void> {
    await this.click(this.loc.forgotPasswordLink, 'Forgot Password');
  }

  async checkRememberMe(): Promise<void> {
    await this.check(this.loc.rememberMeCheckbox);
  }

  async getErrorMessage(): Promise<string> {
    return this.getText(this.loc.errorMessage);
  }

  async isErrorVisible(): Promise<boolean> {
    return this.isVisible(this.loc.errorMessage);
  }

  async assertErrorMessage(expected: string): Promise<void> {
    await this.assertContainsText(this.loc.errorMessage, expected);
  }

  async assertLoginPageLoaded(): Promise<void> {
    await this.assertVisible(this.loc.usernameInput);
    await this.assertVisible(this.loc.passwordInput);
    await this.assertVisible(this.loc.loginButton);
  }
}
