import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
                                    
export default defineConfig({
  plugins: [glsl()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('/node_modules/three/examples/')) {
            return 'three-examples';
          }

          if (id.includes('/node_modules/three/')) {
            return 'three-core';
          }

          if (id.includes('/node_modules/aws-amplify/') || id.includes('/node_modules/@aws-amplify/')) {
            return 'amplify';
          }
        },
      },
    },
  },
  server: {
    host: true,      // listen on all addresses, not just localhost
    port: 5173,      // or whatever port you prefer
  },
}); 
                   
