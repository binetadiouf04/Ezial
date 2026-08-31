/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#171717',
        cream: '#FAF8F5',
        fog: '#F2F0ED',
        line: '#E8E5E1',
        burgundy: {
          DEFAULT: '#651D32',
          deep: '#3F111F',
        },
        champagne: '#C4A46B',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightish: '-0.01em',
        editorial: '0.02em',
      },
    },
  },
  plugins: [],
};
