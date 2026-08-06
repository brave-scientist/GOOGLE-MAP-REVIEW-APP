import type { Config } from "tailwindcss";

/**
 * Tailwind theme tokens are derived directly from the approved landing-page
 * design (landing-page.html) so the marketing site and the in-app UI share one
 * source of truth. Values are quoted verbatim from the `:root` block of that
 * file — do not drift these without a design decision logged in Decision-Log.md.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#13261D", 2: "#1C3327", 3: "#24402F" },
        paper: { DEFAULT: "#EFEADC", 2: "#E5DFC9" },
        brass: { DEFAULT: "#C89B3C", light: "#E0BC6E" },
        coral: "#E8604A",
        cream: { DEFAULT: "#F6F1E4", dim: "#CFC9B4" },
        "ink-text": "#152018",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;