import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    // NOTE: GEMINI_API_KEY is intentionally NOT exposed to the frontend anymore.
    // Gemini calls go through the `gemini-parse` Supabase Edge Function, which
    // holds the key as a server-side secret. Only the public Supabase URL +
    // anon key reach the browser (via VITE_* vars in supabaseClient.ts).
    return {
      // Root-domain deploy on Vercel / Cloudflare Pages. If you ever switch back
      // to GitHub Pages under a sub-path, set this to '/linc-s-work-6-23/'.
      base: '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
