import { defineConfig } from 'vite';
export default defineConfig({ base: './', define: {'import.meta.env.VITE_API_ENABLED': JSON.stringify(process.env.NETLIFY === 'true' ? 'true' : (process.env.VITE_API_ENABLED || 'false'))}, server: { proxy: { '/api': 'http://127.0.0.1:8788' } } });
