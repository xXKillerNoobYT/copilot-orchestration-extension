module.exports = {
  // Use ts-jest to transform TypeScript files
  preset: 'ts-jest',

  // Use Node environment (VS Code extensions run in Node.js)
  testEnvironment: 'node',

  // Find test files in tests/ folder with .test.ts extension
  testMatch: ['**/tests/**/*.test.ts'],

  // Where to look for source and test files
  roots: ['<rootDir>/src', '<rootDir>/tests'],

  // Collect coverage from source files only
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts', // Exclude type definition files
  ],

  // Coverage thresholds (starting at 0%, will raise to 80%+ later)
  coverageThreshold: {
    global: {
      lines: 0,
      branches: 0,
      functions: 0,
      statements: 0
    }
  },

  // Mock the 'vscode' module (not available in test environment)
  moduleNameMapper: {
    '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts'
  },

  // Display individual test results with detailed output
  verbose: true,
};
