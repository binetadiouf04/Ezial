/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#171717',
        cream: '#F8F3EE',
        beige: '#D8C6C2',
        fog: '#F2F0ED',
        line: '#E8E5E1',
        burgundy: {
          DEFAULT: '#5A0D1E',
          deep: '#3A0812',
          ruby: '#8C1024',
        },
        champagne: '#C4A46B',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        // Le mot « EZIAL » seul (logo) garde Playfair Display.
        logo: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightish: '-0.01em',
        editorial: '0.02em',
      },
      keyframes: {
        'marquee-left': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-right': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'marquee-left': 'marquee-left 40s linear infinite',
        'marquee-right': 'marquee-right 40s linear infinite',
      },
    },
  },
  plugins: [],
};
