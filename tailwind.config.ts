import type { Config } from "tailwindcss";

export default {
  content: ["./client/src/**/*.{ts,tsx}", "./client/index.html"],
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
