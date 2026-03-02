import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "comment-highlight": {
          "0%": { boxShadow: "0 0 0 3px rgba(253, 224, 71, 0.8)" },
          "100%": { boxShadow: "none" },
        },
      },
      animation: {
        "comment-highlight": "comment-highlight 1.2s ease-out forwards",
      },
      zIndex: {
        navbar: "40",
        "navbar-dropdown": "50",
        sidebar: "45",
        "modal-overlay": "100",
        "modal-content": "110",
        tooltip: "120",
        "tooltip-popover": "120",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Reddit 风格颜色
        reddit: {
          orange: "#FF4500",
          blue: "#0079D3",
          "bg-page": "#DAE0E2",
          "bg-card": "#FFFFFF",
          "text-primary": "#1A1A1B",
          "text-secondary": "#7C7C7C",
          border: "#EDEFF1",
          "border-alt": "#CCC",
          "bg-input": "#F6F7F8",
        },
        // 兼容性：primary 指向 Reddit 橙色
        primary: {
          DEFAULT: "#FF4500",
          hover: "#FF5722",
          light: "#FFE5DD",
        },
      },
    },
  },
  plugins: [],
};
export default config;

