/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        'rocks': ['Chinese Rocks', 'sans-serif'],
        'incon': ['"Inconsolata Variable"'],
        'anon': ['"Anonymous Pro"'],
      }, 
      fontWeight: {
        'regular': 400,
        'bold': 700,
      },
    },
  },
  plugins: [require("daisyui")],
}

