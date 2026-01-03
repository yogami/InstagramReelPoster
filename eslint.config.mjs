import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
    // Base ESLint recommended rules
    eslint.configs.recommended,

    // TypeScript configuration
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: './tsconfig.json'
            },
            globals: {
                ...globals.node,
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint
        },
        rules: {
            // TypeScript specific rules
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',

            // Code Quality Rules (Phase 2)
            'max-lines-per-function': ['warn', {
                max: 50,  // Increased from 30 to 50 for practicality
                skipBlankLines: true,
                skipComments: true
            }],
            'max-lines': ['warn', {
                max: 300,  // Increased from 200 to 300 for practicality
                skipBlankLines: true,
                skipComments: true
            }],
            'complexity': ['error', 10],  // Craftsmanship standard: ≤10
            'max-params': ['warn', 4],   // Craftsmanship standard: ≤4
            'no-magic-numbers': 'off',   // Too noisy - keep off for now

            // General best practices
            'no-console': 'off',  // Keep console for logging
            'prefer-const': 'warn',
            'no-var': 'error',
            'eqeqeq': ['warn', 'always'],
            'no-unused-vars': 'off'  // Handled by TypeScript
        }
    },

    // Ignore patterns
    {
        ignores: ['dist/**', 'node_modules/**', 'tests/**', '*.js', '*.mjs']
    }
];
