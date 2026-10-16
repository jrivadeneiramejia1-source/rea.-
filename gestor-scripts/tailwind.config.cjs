module.exports = {
  content: ["./.tw-content.html"],
  theme: { extend: {
    colors: { canvas: "#0a0f0d", panel: "#111a16", raised: "#17231d", line: "#263730",
      ink: "#e2ebe6", mute: "#8fa39a", faint: "#5d706a",
      acc: { DEFAULT: "#3ddc84", ink: "#06240f" }, good: "#3ddc84", warn: "#f0b44c", bad: "#f07a62", info: "#5fb4f0" },
    fontFamily: { sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"], mono: ['"IBM Plex Mono"', "monospace"] } } },
};
