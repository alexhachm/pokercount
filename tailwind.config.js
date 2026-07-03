/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  future: {
    // hover: variants only apply on devices with real hover support, so
    // taps on iOS never leave buttons stuck in their hover state.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#0a3d24',
          light: '#0b6e3b',
          dark: '#072c1a',
        },
        chip: {
          red: '#c0392b',
          gold: '#e1b12c',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
