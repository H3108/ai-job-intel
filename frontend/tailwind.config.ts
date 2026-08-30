/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fira Code"', 'ui-monospace', 'monospace'],
        body: ['"Fira Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
}
