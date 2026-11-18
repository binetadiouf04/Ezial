import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Identifiant de la version construite : le commit déployé par Cloudflare Pages
// (CF_PAGES_COMMIT_SHA), sinon l'heure du build. Embarqué dans le JavaScript
// (__EZIAL_BUILD_ID__) et publié dans /version.json : l'application compare
// les deux pour savoir qu'une nouvelle version est en ligne (src/lib/appUpdate.ts).
const BUILD_ID = (process.env.CF_PAGES_COMMIT_SHA || '').slice(0, 12)
  || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function versionFile(isBuild: boolean): Plugin {
  return {
    name: 'ezial-version-file',
    generateBundle() {
      if (!isBuild) return;
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ build: BUILD_ID, builtAt: new Date().toISOString() })}\n`,
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // Served from https://ezial.net (Cloudflare Pages custom domain, at root)
  base: '/',
  plugins: [react(), versionFile(command === 'build')],
  define: {
    // « dev » en développement : jamais de proposition de mise à jour.
    __EZIAL_BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
}));
