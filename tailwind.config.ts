import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        meraki: {
          primary: "#78BE20",
          teal:    "#049FD9",
          dark:    "#1B2A3D",
          bg:      "var(--meraki-bg)",
          card:    "var(--meraki-card)",
          surface: "var(--meraki-surface)",
          border:  "var(--meraki-border)",
          text:    "var(--meraki-text)",
          muted:   "var(--meraki-muted)",
          green:   "#36B37E",
          yellow:  "#FFAB00",
          red:     "#DE350B",
          orange:  "#FF8B00",
        },
      },
    },
  },
  plugins: [],
};

export default config;
