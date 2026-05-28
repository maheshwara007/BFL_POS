import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/api/**/*.spec.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
  globalSetup: './tests/api/jest.global-setup.ts',
  globalTeardown: './tests/api/jest.global-teardown.ts',
  reporters: [
    'default',
    ['jest-html-reporter', {
      pageTitle: 'BFL API Test Report',
      outputPath: 'reports/bfl-api-report.html',
      includeConsoleLog: true,
    }],
  ],
};

export default config;
