/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,jsx,ts,tsx}',
    './src/features/**/*.{js,jsx,ts,tsx}',
    './src/common/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#208AEF',
          50: '#EBF5FF',
          100: '#E1EFFE',
          200: '#C3DDFD',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#208AEF',
          600: '#1B74CC',
          700: '#155CA3',
          800: '#1E429F',
          900: '#1E3A8A',
        },
      },
      fontFamily: {
        sans: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        rounded: ['var(--font-rounded)', 'ui-rounded', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
