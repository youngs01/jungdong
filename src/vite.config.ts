import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'https://192.168.0.230:3000',
            changeOrigin: true,
            secure: false
          }
        },
        middleware: [
          (req: any, res: any, next: any) => {
            if (req.url === '/index.css') {
              res.setHeader('Content-Type', 'text/css');
            }
            next();
          }
        ]
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
