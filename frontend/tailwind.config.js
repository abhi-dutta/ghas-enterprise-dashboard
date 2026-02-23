/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        critical: '#9b59b6',
        high:     '#e74c3c',
        medium:   '#f39c12',
        low:      '#f1c40f',
      },
    },
  },
  plugins: [],
}
