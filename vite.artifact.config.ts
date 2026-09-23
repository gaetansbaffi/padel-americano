// Build destiné à l'hébergement en Artifact claude.ai : React vient de cdnjs
// (seul hôte de scripts autorisé), le code de l'application est publié à côté
// de la page avec des noms de fichiers fixes.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Chemin racine du projet (préfixe « / » résolu par Vite).
const shim = (name: string) => `/artifact/shims/${name}`;

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: [
      { find: /^react\/jsx-runtime$/, replacement: shim('jsx-runtime.ts') },
      { find: /^react\/jsx-dev-runtime$/, replacement: shim('jsx-runtime.ts') },
      { find: /^react-dom\/client$/, replacement: shim('react-dom-client.ts') },
      { find: /^react$/, replacement: shim('react.ts') },
    ],
  },
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/app[extname]',
      },
    },
  },
});
