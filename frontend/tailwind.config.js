/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{svelte,ts,js,html}",
    "./src/components/**/*.{svelte,ts,js}",
    "./src/routes/**/*.{svelte,ts,js}"
  ],
  theme: {
    extend: {
      scrollbar: {
        thin: {
          width: '4px',
          height: '4px',
        },
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar')
  ],
}
