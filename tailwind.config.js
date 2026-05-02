/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  // Tailwind v4 uses CSS-first configuration
  // Most configuration is done in globals.css with @theme
  theme: {
    extend: {},
  },
  plugins: [],
  safelist: [
    // Google Center sidebar – prevenim purjarea pe producție (Vercel)
    "hidden",
    "lg:flex",
    "md:flex",
  ],
}


