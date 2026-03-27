import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
                                    
export default defineConfig({
  plugins: [glsl()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    host: true,      // listen on all addresses, not just localhost
    port: 5173,      // or whatever port you prefer
  },
}); 
                   