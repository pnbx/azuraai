module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'lib/**/*.ts',
    'tests/**/*.ts'
  ],
  coverageDirectory: 'coverage',
  testMatch: ['**/tests/**/*.test.ts', '**/tests/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};