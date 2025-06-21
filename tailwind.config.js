/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
        'pretendard': ['Pretendard', 'sans-serif'],
      },
      colors: {
        'dark': '#0D1A2B',
        'primary': '#3FB8FF',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
} 