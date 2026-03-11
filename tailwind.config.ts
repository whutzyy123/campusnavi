import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* 移动端布局：以 1920x1080 为基准，21:9 及更高分辨率适配 */
      screens: {
        "ultra-wide": { raw: "(min-aspect-ratio: 21/9)" },
        "wide-mobile": { raw: "(min-aspect-ratio: 2/1)" },
      },
      maxWidth: {
        "mobile-content": "var(--mobile-content-max)",
      },
      height: {
        "screen-dvh": "100dvh",
      },
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
  plugins: [require("@tailwindcss/typography")],
};
export default config;

