import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Camera access requires HTTPS on real devices; localhost is exempt.
    // For phone testing on your LAN, run `npm run dev -- --host` and open
    // the printed URL, then accept the self-signed-cert prompt if you add
    // a plugin like @vitejs/plugin-basic-ssl.
    host: true
  },
  build: {
    target: 'es2020',
    sourcemap: true
  }
});
