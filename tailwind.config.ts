import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        paper: "#f8fafc",
        accent: "#0f766e",
        warning: "#c2410c",
        danger: "#b91c1c",
      },
      boxShadow: {
        panel: "0 20px 45px -24px rgba(15, 23, 42, 0.35)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
