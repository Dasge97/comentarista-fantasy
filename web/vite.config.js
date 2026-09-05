import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo la web corre en su propio puerto y las llamadas a la API se
// redirigen al proceso de Node. En producción los dos van juntos.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
