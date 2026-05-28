import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { logger } from '../utils/Logger';
import { Config } from '../utils/ConfigReader';

type Pages = {
  loginPage: LoginPage;
  homePage:  HomePage;
  baseUrl:   string;
};

export const test = base.extend<Pages>({
  baseUrl: async ({}, use) => {
    await use(Config.baseUrl);
  },

  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  homePage: async ({ page }, use) => {
    const homePage = new HomePage(page);
    await use(homePage);
  },
});

export { expect } from '@playwright/test';
