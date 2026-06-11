import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Validação do agente roda em repos que podem não ter testes ainda (MAC-29).
    passWithNoTests: true,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Popula env dummy antes dos testes (módulos validam env no import).
    setupFiles: ['./vitest.setup.ts'],
  },
});
