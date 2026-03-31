/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}", "*.html"],
  theme: {
    extend: {
      fontFamily: {
        'mood': ['"Lazy Dog"', 'Biscuit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}