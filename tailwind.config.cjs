/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        'rocks': ['Chinese Rocks', 'sans-serif'],
        'incon': ['"Inconsolata Variable"'],
        'anon': ['"Anonymous Pro"'],
        'bahianita': ['Bahianita'],
        'bahiana': ['Bahiana'],
      }, 
      fontWeight: {
        'regular': 400,
        'bold': 700,
      },
    },
  },
  plugins: [require("daisyui")],
}

