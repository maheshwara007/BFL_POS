import { Page } from '@playwright/test';

export const HomeLocators = (page: Page) => ({
  welcomeMessage: page.locator('.title'),
  navBar:         page.locator('.primary_header'),
  logoutButton:   page.locator('#logout_sidebar_link'),
  profileMenu:    page.locator('#react-burger-menu-btn'),
  pageHeading:    page.locator('.title'),
  searchInput:    page.locator('[data-test="search"]'),
  searchButton:   page.locator('button[aria-label="Search"]'),
});
