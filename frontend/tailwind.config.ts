import type { Config } from "tailwindcss"

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg-rgb) / <alpha-value>)",
        "bg-2": "rgb(var(--bg-2-rgb) / <alpha-value>)",
        surface: "var(--surface)",
        "surface-solid": "rgb(var(--surface-solid-rgb) / <alpha-value>)",
        text: "rgb(var(--text-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        border: "rgb(var(--border-rgb) / <alpha-value>)",
        primary: "rgb(var(--primary-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        point: "rgb(var(--point-rgb) / <alpha-value>)",
        success: { DEFAULT: "rgb(var(--success-rgb) / <alpha-value>)", soft: "var(--success-bg)", fg: "var(--success-fg)", border: "var(--success-border)" },
        warning: { DEFAULT: "rgb(var(--warning-rgb) / <alpha-value>)", soft: "var(--warning-bg)", fg: "var(--warning-fg)", border: "var(--warning-border)" },
        danger: { DEFAULT: "rgb(var(--danger-rgb) / <alpha-value>)", soft: "var(--danger-bg)", fg: "var(--danger-fg)", border: "var(--danger-border)" },
        info: { DEFAULT: "rgb(var(--info-rgb) / <alpha-value>)", soft: "var(--info-bg)", fg: "var(--info-fg)", border: "var(--info-border)" },
      },
      fontFamily: {
        // 拉丁展示字体 Space Grotesk；中文与无 Space Grotesk 字形回退到系统字体栈（零下载）。
        display: ['"Space Grotesk"', 'system-ui', '-apple-system', '"PingFang SC"', '"Microsoft YaHei"', '"Segoe UI"', 'Roboto', 'sans-serif'],
        body: ['system-ui', '-apple-system', '"PingFang SC"', '"Microsoft YaHei"', '"Segoe UI"', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        "elevation-1": "var(--shadow-sm)",
        "elevation-2": "var(--shadow-md)",
        "elevation-3": "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
      },
      fontSize: {
        xs: ["var(--fs-xs)", { lineHeight: "var(--lh-snug)" }],
        sm: ["var(--fs-sm)", { lineHeight: "var(--lh-snug)" }],
        base: ["var(--fs-base)", { lineHeight: "var(--lh-normal)" }],
        md: ["var(--fs-md)", { lineHeight: "var(--lh-normal)" }],
        lg: ["var(--fs-lg)", { lineHeight: "var(--lh-snug)" }],
        xl: ["var(--fs-xl)", { lineHeight: "var(--lh-snug)" }],
        "2xl": ["var(--fs-2xl)", { lineHeight: "var(--lh-tight)" }],
        "3xl": ["var(--fs-3xl)", { lineHeight: "var(--lh-tight)" }],
        "4xl": ["var(--fs-4xl)", { lineHeight: "var(--lh-tight)" }],
        "5xl": ["var(--fs-5xl)", { lineHeight: "var(--lh-tight)" }],
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [],
} satisfies Config
