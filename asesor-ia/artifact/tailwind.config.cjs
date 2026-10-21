// Configuración de Tailwind 3.4.17 para compilar los estilos que van dentro de asesor-ia.html.
module.exports = {
  content: ["./.tw-content.html"],
  theme: {
    extend: {
      colors: {
        canvas: "#0b1117", panel: "#111a22", raised: "#17232d", line: "#24343f",
        ink: "#e4ebef", mute: "#93a4af", faint: "#7f909b",
        acc: { DEFAULT: "#f2a541", ink: "#1b1205" },
        good: "#4cc184", warn: "#f0b44c", bad: "#f07a62", info: "#6aa6ec",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Trebuchet MS"', "system-ui", "sans-serif"],
        sans: ['"Atkinson Hyperlegible"', "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Consolas", "monospace"],
      },
    },
  },
};
