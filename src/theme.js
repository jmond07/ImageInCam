// Colors for everything drawn on the canvas. They are read from the CSS variables in
// style.css, so the palette lives in one place. The fallbacks are the same values.
const css = getComputedStyle(document.documentElement);
const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;

export const theme = {
  bg: read('--bg', '#141414'),
  text: read('--text', '#e8e8e8'),
  accent: read('--accent', '#ff9a3d'),
  track: 'rgba(255, 255, 255, 0.25)', // unfilled part of a progress ring
};