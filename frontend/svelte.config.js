import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [],
  kit: {
    adapter: adapter(),
  },
};

export default config;

