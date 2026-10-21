module.exports = {
  content: ["./public/index.html", "./public/lanzador.js", "./public/asesor-puente.js"],
  theme: { extend: {
    colors: { canvas: "#0a0f0d", panel: "#111a16", raised: "#17231d", line: "#263730",
      ink: "#e2ebe6", mute: "#8fa39a", faint: "#5d706a",
      acc: { DEFAULT: "#3ddc84", ink: "#06240f" }, good: "#3ddc84", warn: "#f0b44c", bad: "#f07a62", info: "#5fb4f0" },
    keyframes: {
      entra: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
      sube: { "0%": { opacity: "0", transform: "translateY(24px)" }, "100%": { opacity: "1", transform: "none" } },
      pasa: { "0%": { opacity: "0", transform: "translateX(18px)" }, "100%": { opacity: "1", transform: "none" } },
    },
    animation: { entra: "entra .18s ease-out both", sube: "sube .22s ease-out both", pasa: "pasa .2s ease-out both" },
    fontFamily: { sans: ["system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"], mono: ['"Cascadia Mono"', "Consolas", "ui-monospace", "monospace"] } } },
};
