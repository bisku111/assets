// Configurazione ESLint esplicita: `expo lint` la scaricherebbe al primo
// avvio, cosa che in CI o dietro un proxy non funziona. Meglio averla
// nel repository e versionata.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,

  { ignores: ['dist/*', '.expo/*', 'node_modules/*', 'ios/*', 'android/*', 'coverage/*'] },

  {
    rules: {
      // Regola pensata per l'HTML: in React Native non esistono entita',
      // e scrivere &apos; farebbe comparire "&apos;" a schermo. L'app e'
      // in italiano, quindi gli apostrofi sono ovunque.
      'react/no-unescaped-entities': 'off',

      // Il controllo delle variabili inutilizzate lo fa TypeScript, che
      // capisce le posizioni di tipo; la regola base di ESLint no e
      // segnala i parametri delle firme di interfaccia.
      'no-unused-vars': 'off',

      // Array<T> e' piu' leggibile di T[] quando T e' un tipo composto.
      '@typescript-eslint/array-type': 'off',
    },
  },

  {
    files: ['jest.setup.js', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: { jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly',
                 beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly' },
    },
  },

  {
    files: ['scripts/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
];
