import { test, expect } from '../fixtures/base.fixture';
import users from '../test-data/users.json';

/**
 * Login Test Suite
 * Target: https://www.saucedemo.com
 */

test.describe('Login Page', () => {

  test.beforeEach(async ({ loginPage, baseUrl }) => {
    await loginPage.open(baseUrl);
  });

  // TC-001
  test('TC-001: Login page loads with required elements', async ({ loginPage }) => {
    await loginPage.assertLoginPageLoaded();
  });

  // TC-002
  test('TC-002: Successful login with valid credentials', async ({ loginPage, homePage, page, baseUrl }) => {
    await loginPage.login(users.valid.username, users.valid.password);
    await homePage.assertHomePageLoaded();
    expect(page.url()).toContain('/inventory');
  });

  // TC-003
  test('TC-003: Login fails with invalid credentials', async ({ loginPage }) => {
    await loginPage.login(users.invalid.username, users.invalid.password);
    await loginPage.assertErrorMessage('Username and password do not match');
  });

  // TC-004
  test('TC-004: Login fails with empty username', async ({ loginPage }) => {
    await loginPage.login('', users.valid.password);
    await loginPage.assertErrorMessage('Username is required');
  });

  // TC-005
  test('TC-005: Login fails with empty password', async ({ loginPage }) => {
    await loginPage.login(users.valid.username, '');
    await loginPage.assertErrorMessage('Password is required');
  });

  // TC-006
  test('TC-006: Login fails with both fields empty', async ({ loginPage }) => {
    await loginPage.login('', '');
    await loginPage.assertErrorMessage('Username is required');
  });

  // TC-007
  test('TC-007: Locked out user sees correct error', async ({ loginPage }) => {
    await loginPage.login(users.lockedOut.username, users.lockedOut.password);
    await loginPage.assertErrorMessage('Sorry, this user has been locked out');
  });

  // TC-008
  test('TC-008: Password field masks input', async ({ page, baseUrl }) => {
    const type = await page.locator('#password').getAttribute('type');
    expect(type).toBe('password');
  });

});

test.describe('Post-Login', () => {

  test.beforeEach(async ({ loginPage, baseUrl }) => {
    await loginPage.open(baseUrl);
    await loginPage.login(users.valid.username, users.valid.password);
  });

  // TC-009
  test('TC-009: Logout navigates back to login page', async ({ homePage, page, baseUrl }) => {
    await homePage.logout();
    await expect(page).toHaveURL(`${baseUrl}/`);
  });

});
