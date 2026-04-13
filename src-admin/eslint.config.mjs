import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.js', '*.mjs', 'src/theme.js'],
                },
                tsconfigRootDir: import.meta.dirname,
                project: './tsconfig.json',
            },
        },
    },
    {
        // disable temporary the rule 'jsdoc/require-param' and enable 'jsdoc/require-jsdoc'
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/check-param-names': 'off',
        },
    },
    {
        ignores: ['.__mf__temp/**/*', 'build/**/*', 'node_modules/**/*', '**/*.mjs', '**/*.jsx'],
    },
];
