import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#000000",
          900: "#0a0a0a",
          850: "#111111",
          800: "#161616",
          700: "#1d1d1f",
          600: "#2c2c2e",
          500: "#3a3a3c",
        },
        mist: {
          400: "#8e8e93",
          300: "#aeaeb2",
          200: "#d1d1d6",
          100: "#f2f2f7",
        },
        // legacy alias kept so old classes don't break during transition
        azure: {
          50: "#f5f5f5",
          100: "#e5e5e5",
          200: "#d4d4d4",
          300: "#a3a3a3",
          400: "#737373",
          500: "#ffffff",
          600: "#e5e5e5",
          700: "#cccccc",
          800: "#a3a3a3",
          900: "#737373",
        },
      },
      fontFamily: {
        sans: [
          "Vazirmatn",
          "-apple-system",
          "Segoe UI",
          "Tahoma",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        glow: "0 0 80px -20px rgba(255, 255, 255, 0.15)",
        card: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 20px 40px -20px rgba(0,0,0,0.8)",
      },
      animation: {
        "fade-up": "fade-up 0.9s cubic-bezier(0.16, 1, 0.3, 1) both",
        marquee: "marquee 40s linear infinite",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(50%)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
