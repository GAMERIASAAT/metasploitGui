/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'msf-dark': '#0d1117',
        'msf-darker': '#010409',
        'msf-card': '#161b22',
        'msf-border': '#30363d',
        'msf-accent': '#238636',
        'msf-accent-hover': '#2ea043',
        'msf-red': '#f85149',
        'msf-yellow': '#d29922',
        'msf-blue': '#58a6ff',
        'msf-purple': '#a371f7',
      },
      keyframes: {
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.3s ease-out',
        'slide-out': 'slide-out 0.3s ease-in',
      },
    },
  },
  plugins: [],
}
