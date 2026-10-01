import { defineConfig } from 'astro/config';

// GH Pages (project site) => base '/huggingface-crawler/' via SITE_BASE env.
// Local/dev + static preview => base '/'.
export default defineConfig({
  base: process.env.SITE_BASE || '/',
  build: { format: 'directory' },
});
