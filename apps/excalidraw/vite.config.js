import { defineConfig } from 'vite';
export default defineConfig({
  base:'/',
  plugins:[{
    name:'aer-local-font-fallback',
    enforce:'pre',
    transform(code,id){
      if(!id.includes('/@excalidraw/excalidraw/') || !code.includes('ASSETS_FALLBACK_URL'))return;
      // Upstream always appends a CDN fallback, even when ASSET_PATH is set.
      // The installed package includes every font and must work fully offline.
      return code.replace(/("ASSETS_FALLBACK_URL",)`https:\/\/esm\.sh\/[\s\S]*?\/dist\/prod\/`/g,'$1window.location.origin+"/"');
    }
  }],
  build:{outDir:'dist',emptyOutDir:true}
});
