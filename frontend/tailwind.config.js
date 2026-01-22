import typography from '@tailwindcss/typography';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "src/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        claude: {
          50: '#fdf8f6',
          100: '#f9efe9',
          200: '#f3ddd1',
          300: '#e9c4ae',
          400: '#dca683',
          500: '#d48a5f',
          600: '#c77347',
          700: '#a65d3a',
          800: '#864c33',
          900: '#6d402c',
        },
        codex: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
    },
  },
  plugins: [typography],
};
