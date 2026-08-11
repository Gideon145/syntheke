/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#0a0a0b", raised: "#111114", overlay: "#18181b", hover: "#1c1c20" },
        border: { DEFAULT: "#27272a", subtle: "#1f1f22", light: "#3f3f46", glow: "#52525b" },
        muted: { DEFAULT: "#71717a", foreground: "#a1a1aa" },
        accent: { DEFAULT: "#fafafa", muted: "#d4d4d8", hover: "#ffffff" },
        okx: { DEFAULT: "#836EF9", muted: "#6b5bd4", glow: "rgba(131,110,249,0.15)" },
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        // Text colors
        "text-primary": "#fafafa",
        "text-secondary": "#a1a1aa",
        "text-muted": "#71717a",
        // Backgrounds
        "bg": "#0a0a0b",
        "bg-secondary": "#111114",
        "bg-raised": "#18181b",
        "accent-purple": "#836EF9",
        "accent-purple-hover": "#9B8FF7",
        "accent-cyan": "#22d3ee",
        "accent-cyan-glow": "rgba(34,211,238,0.12)",
        // Kage-inspired — warm, lantern-light tones
        amber: { DEFAULT: "#d4a574", glow: "rgba(212,165,116,0.08)" },
        lantern: { DEFAULT: "#f5e6d3", glow: "rgba(245,230,211,0.03)" },
        "border-hairline": "#ffffff0d",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
        serif: ['"STIX Two Text"', '"Georgia"', "serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.875rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.02em" }],
        "4xl": ["2.25rem", { lineHeight: "2.75rem", letterSpacing: "-0.025em" }],
        "5xl": ["3rem", { lineHeight: "3.5rem", letterSpacing: "-0.03em" }],
      },
      boxShadow: {
        glow: "0 0 20px rgba(131,110,249,0.15), 0 0 40px rgba(131,110,249,0.05)",
        "glow-cyan": "0 0 20px rgba(34,211,238,0.12), 0 0 40px rgba(34,211,238,0.04)",
        "glow-success": "0 0 20px rgba(34,197,94,0.12)",
        card: "0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)",
      },
      animation: {
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(131,110,249,0.08)" },
          "50%": { boxShadow: "0 0 30px rgba(131,110,249,0.2)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
