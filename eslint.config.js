// ESLint 9.x flat config format
const globals = require('globals');

module.exports = [
    {
        // Ignore patterns (replaces .eslintignore)
        ignores: [
            'node_modules/**',
            'reference-scripts/**',
            '*.json',
            '.git/**',
            '.claude/**',
            'my-scripts-backup.zip',
            'wme.txt',
            'wme-api-discovery.json',
            'wme-api-discovery.txt'
        ]
    },
    {
        // Configuration for JavaScript files
        files: ['**/*.js', '**/*.user.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                W: 'readonly',
                unsafeWindow: 'readonly',
                GM_xmlhttpRequest: 'readonly',
                OpenLayers: 'readonly'
            }
        },
        rules: {
            'indent': ['error', 4],
            'linebreak-style': ['error', 'unix'],
            'quotes': ['error', 'single', { avoidEscape: true }],
            'semi': ['error', 'always'],
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'max-len': ['warn', {
                code: 120,
                ignoreComments: true,
                ignoreStrings: true,
                ignoreTemplateLiterals: true
            }],
            'prefer-const': 'warn',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all'],
            'brace-style': ['error', '1tbs'],
            'space-before-function-paren': ['error', {
                anonymous: 'never',
                named: 'never',
                asyncArrow: 'always'
            }],
            'keyword-spacing': ['error', { before: true, after: true }],
            'space-infix-ops': 'error',
            'comma-spacing': ['error', { before: false, after: true }],
            'no-trailing-spaces': 'error',
            'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }]
        }
    }
];
