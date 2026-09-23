import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : le build peut être ouvert depuis n'importe quel dossier.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
