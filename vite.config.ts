import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function clinicflowBuildStampPlugin(buildId: string, builtAt: string): Plugin {
  return {
    name: 'clinicflow-build-stamp',
    transformIndexHtml(html) {
      return html.replace('__CLINICFLOW_BUILD_ID__', buildId);
    },
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      const swDistPath = path.join(distDir, 'sw.js');
      if (fs.existsSync(swDistPath)) {
        const swContent = fs.readFileSync(swDistPath, 'utf-8');
        fs.writeFileSync(
          swDistPath,
          swContent.replaceAll('__CLINICFLOW_BUILD_ID__', buildId),
          'utf-8'
        );
      }

      fs.writeFileSync(
        path.join(distDir, 'version.json'),
        JSON.stringify({ buildId, builtAt }),
        'utf-8'
      );
    }
  };
}

export default defineConfig(() => {
  const buildId = Date.now().toString(36);
  const builtAt = new Date().toISOString();

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
      __APP_BUILT_AT__: JSON.stringify(builtAt),
    },
    plugins: [react(), tailwindcss(), clinicflowBuildStampPlugin(buildId, builtAt)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'firebase';
            }
            if (id.includes('node_modules/xlsx')) {
              return 'xlsx';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'icons';
            }
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
