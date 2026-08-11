/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#0a0a0b", raised: "#111114", overlay: "#18181b" },
        border: { DEFAULT: "#27272a", subtle: "#1f1f22" },
        muted: { DEFAULT: "#71717a", foreground: "#a1a1aa" },
        accent: { DEFAULT: "#fafafa", muted: "#d4d4d8" },
        okx: { DEFAULT: "#836EF9", muted: "#6b5bd4" },
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.875rem" }],
      },
    },
  },
  plugins: [],
};
