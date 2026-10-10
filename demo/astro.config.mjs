import { defineConfig } from 'astro/config';
import askstatic from 'astro-integration-askstatic';

export default defineConfig({
  integrations: [askstatic({ languages: ['en', 'bg'] })],
});
