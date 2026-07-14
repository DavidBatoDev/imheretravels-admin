/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",

    // Or if using `src` directory:
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Brand typography using CSS variables from Next.js fonts
        "hk-grotesk": ["var(--font-hk-grotesk)", "system-ui", "sans-serif"],
        "dm-sans": ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        // Set DM Sans as primary brand font for body text
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        // www-compatible aliases — used by WYSIWYG tour form sections
        display: ["var(--font-cartograph)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        body: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Legacy admin typography tokens
        heading: ["96px", { lineHeight: "120%", letterSpacing: "-2%" }],
        subhead: ["48px", { lineHeight: "120%", letterSpacing: "-2%" }],
        standfirst: ["24px", { lineHeight: "140%", letterSpacing: "0%" }],
        "admin-body": ["16px", { lineHeight: "150%", letterSpacing: "0%" }],
        "cta-url": ["16px", { lineHeight: "100%", letterSpacing: "0%" }],
        // www brand type scale — matches globals.css @theme tokens
        "h1-desktop": ["3rem", { lineHeight: "1.2", letterSpacing: "-0.05em", fontWeight: "700" }],
        "h1-mobile":  ["2.5rem", { lineHeight: "1.2", letterSpacing: "-0.05em", fontWeight: "700" }],
        "h2-desktop": ["2.5rem", { lineHeight: "1.2", letterSpacing: "-0.05em", fontWeight: "700" }],
        "h2-mobile":  ["2.25rem", { lineHeight: "1.2", letterSpacing: "-0.05em", fontWeight: "700" }],
        "h3-desktop": ["2.5rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "h3-mobile":  ["2rem",   { lineHeight: "1.2", letterSpacing: "0", fontWeight: "700" }],
        "h4-desktop": ["2rem",   { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "700" }],
        "h4-mobile":  ["1.5rem", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "700" }],
        "h5-desktop": ["1.5rem", { lineHeight: "1.4", fontWeight: "700" }],
        "h5-mobile":  ["1.25rem",{ lineHeight: "1.4", fontWeight: "700" }],
        "h6-desktop": ["1.25rem",{ lineHeight: "1.4", fontWeight: "700" }],
        "h6-mobile":  ["1.125rem",{ lineHeight: "1.4", fontWeight: "700" }],
        "b1":         ["1.25rem", { lineHeight: "1.5", fontWeight: "500" }],
        "b2-desktop": ["1.125rem",{ lineHeight: "1.5", fontWeight: "500" }],
        "b2-mobile":  ["1rem",    { lineHeight: "1.5", fontWeight: "500" }],
        "b3-desktop": ["1rem",    { lineHeight: "1.5", fontWeight: "500" }],
        "b4-desktop": ["0.875rem",{ lineHeight: "1.5", fontWeight: "500" }],
        "b4-mobile":  ["0.75rem", { lineHeight: "1.5", fontWeight: "500" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        /* Primary Brand Colors */
        "crimson-red": "#EF3340" /* Pantone 032 C */,
        "light-red": "#FF585D",
        white: "#FFFFFF",
        "creative-midnight": "#1C1F2A" /* Pantone 532 C */,
        midnight: "#1C1F2A" /* www alias for creative-midnight */,
        black: "#000000",
        grey: "#959595",
        "light-grey": "#F2F0EE",
        "dark-gray": "#505050" /* www body text color */,

        /* Secondary Brand Colors */
        "royal-purple": "#685BC7" /* Pantone PMS 2725 C */,
        "vivid-orange": "#FF8200" /* Pantone 151 C */,
        "light-orange": "#FFB25B",
        "light-purple": "#B397F7",
        "spring-green": "#26D07C" /* Pantone 7479 C */,
        "light-green": "#E1E66B",
        "sunglow-yellow": "#FED141" /* Pantone 122 C */,
        "light-yellow": "#FBE687",

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        "field-border": "hsl(var(--field-border))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // www brand radii — use these in WYSIWYG tour form sections
        "brand-sm": "0.5rem",  /* 8px */
        "brand-md": "1rem",    /* 16px */
        "brand-lg": "1.5rem",  /* 24px */
      },
      boxShadow: {
        // www brand shadow scale — matches globals.css tokens
        xxsmall: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        xsmall:  "0 1px 2px 0 rgb(0 0 0 / 0.06), 0 1px 3px 0 rgb(0 0 0 / 0.1)",
        small:   "0 2px 4px -2px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.1)",
        medium:  "0 4px 6px -2px rgb(0 0 0 / 0.03), 0 12px 16px -4px rgb(0 0 0 / 0.08)",
        large:   "0 8px 8px -4px rgb(0 0 0 / 0.03), 0 20px 24px -4px rgb(0 0 0 / 0.08)",
        xlarge:  "0 24px 48px -12px rgb(0 0 0 / 0.18)",
        xxlarge: "0 32px 64px -12px rgb(0 0 0 / 0.14)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "collapsible-down": {
          from: {
            height: "0",
            opacity: "0",
          },
          to: {
            height: "var(--radix-collapsible-content-height)",
            opacity: "1",
          },
        },
        "collapsible-up": {
          from: {
            height: "var(--radix-collapsible-content-height)",
            opacity: "1",
          },
          to: {
            height: "0",
            opacity: "0",
          },
        },
        "gradient-shift": {
          "0%, 100%": {
            backgroundPosition: "0% 50%",
          },
          "50%": {
            backgroundPosition: "100% 50%",
          },
        },
        fadeIn: {
          from: {
            opacity: "0",
          },
          to: {
            opacity: "1",
          },
        },
        slideInScale: {
          from: {
            opacity: "0",
            transform: "scale(0.9) translateY(10px)",
          },
          to: {
            opacity: "1",
            transform: "scale(1) translateY(0)",
          },
        },
        modalSlideIn: {
          from: {
            opacity: "0",
            transform: "translate(-50%, -50%) scale(0.9) translateY(20px)",
          },
          to: {
            opacity: "1",
            transform: "translate(-50%, -50%) scale(1) translateY(0)",
          },
        },
        checkmarkPop: {
          "0%": {
            transform: "scale(0)",
            opacity: "0",
          },
          "50%": {
            transform: "scale(1.2)",
          },
          "100%": {
            transform: "scale(1)",
            opacity: "1",
          },
        },
        slideUpFadeIn: {
          from: {
            opacity: "0",
            transform: "translateY(20px)",
          },
          to: {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        shimmer: {
          "0%": {
            transform: "translateX(-100%)",
          },
          "100%": {
            transform: "translateX(100%)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "gradient-shift": "gradient-shift 15s ease infinite",
        "collapsible-down": "collapsible-down 0.3s ease-out",
        "collapsible-up": "collapsible-up 0.3s ease-out",
        fadeIn: "fadeIn 0.3s ease-out",
        slideInScale: "slideInScale 0.4s ease-out",
        modalSlideIn: "modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        checkmarkPop: "checkmarkPop 0.4s ease-out",
        slideUpFadeIn: "slideUpFadeIn 0.4s ease-out",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
