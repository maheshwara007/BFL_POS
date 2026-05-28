import { Page } from '@playwright/test';

export const LoginLocators = (page: Page) => ({
  usernameInput:      page.locator('#user-name'),
  passwordInput:      page.locator('#password'),
  loginButton:        page.locator('#login-button'),
  errorMessage:       page.locator('[data-test="error"]'),
  forgotPasswordLink: page.locator('a[href*="forgot"]'),
  rememberMeCheckbox: page.locator('#remember-me'),
  pageHeading:        page.locator('.login_logo'),
});
