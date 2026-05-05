/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        surface: "#111111",
        surfaceAlt: "#1a1a1a",
        border: "#222222",
        primary: "#6366f1",
        primaryHover: "#4f46e5",
        text: "#f5f5f5",
        muted: "#71717a",
        destructive: "#ef4444"
      }
    }
  },
  plugins: []
};
