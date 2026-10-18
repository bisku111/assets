/**
 * Due progetti Jest:
 *  - "core": TypeScript puro, ambiente node. Copre motore, DSP, scoring, coach.
 *  - "app":  componenti React Native, ambiente jest-expo.
 * Il core resta eseguibile senza alcun runtime React: e' la garanzia
 * che la logica di dominio non dipenda dalla piattaforma.
 */
module.exports = {
  projects: [
    {
      displayName: 'core',
      preset: 'jest-expo/node',
      testMatch: [
        '<rootDir>/src/core/**/*.test.ts',
        '<rootDir>/src/adapters/**/*.test.ts',
        '<rootDir>/src/content/**/*.test.ts',
      ],
    },
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: [
        '<rootDir>/src/@(features|ui|state)/**/*.test.tsx',
        '<rootDir>/src/@(features|ui|state)/**/*.test.ts',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    },
  ],
};
