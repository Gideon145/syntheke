/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#0a0a09', raised: '#121210', overlay: '#1a1a17', hover: '#1f1e1a' },
        border: { DEFAULT: '#2a2824', subtle: '#1f1e1a', light: '#3d3a33', glow: '#4a4640' },
        muted: { DEFAULT: '#6b6860', foreground: '#9c988f' },
        amber: { DEFAULT: '#d4a574', soft: '#c9955e', glow: 'rgba(212,165,116,0.06)', deep: '#5c3d1e' },
        ember: { DEFAULT: '#c2704a' },
        lantern: { DEFAULT: '#f0d9b5', glow: 'rgba(240,217,181,0.03)' },
        vermilion: { DEFAULT: '#b5453a' },
        cypress: { DEFAULT: '#3d4a3d' },
        stone: { DEFAULT: '#8c8579' },
        success: '#4a7c59',
        warning: '#c9955e',
        danger: '#b5453a',
        'text-primary': '#f5ede0',
        'text-secondary': '#9c988f',
        'text-muted': '#6b6860',
        'bg': '#0a0a09',
        'bg-secondary': '#121210',
        'bg-raised': '#1a1a17',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        serif: ['"STIX Two Text"', '"Georgia"', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem', letterSpacing: '-0.025em' }],
        '5xl': ['3rem', { lineHeight: '3.5rem', letterSpacing: '-0.03em' }],
      },
      boxShadow: {
        'glow-amber': '0 0 30px rgba(212,165,116,0.04), 0 0 60px rgba(212,165,116,0.02)',
        'glow-lantern': '0 0 40px rgba(240,217,181,0.03)',
        card: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02)',
      },
      animation: {
        'lantern-pulse': 'lantern-pulse 6s ease-in-out infinite',
      },
      keyframes: {
        'lantern-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(212,165,116,0.02)' },
          '50%': { boxShadow: '0 0 40px rgba(212,165,116,0.06)' },
        },
      },
    },
  },
  plugins: [],
};
