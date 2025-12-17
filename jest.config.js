/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleNameMapper: {
        '^@domain/(.*)$': '<rootDir>/src/domain/$1',
        '^@application/(.*)$': '<rootDir>/src/application/$1',
        '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
        '^@presentation/(.*)$': '<rootDir>/src/presentation/$1',
        '^@config/(.*)$': '<rootDir>/src/config/$1',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    verbose: true,
};
