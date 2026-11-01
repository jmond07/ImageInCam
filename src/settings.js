const KEY = 'imageincam.settings';

export const DEFAULT_SETTINGS = { hands: 2, mirror: true, lab: true };

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return {
      hands: s?.hands === 1 ? 1 : 2,
      mirror: s?.mirror !== false,
      lab: s?.lab !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // not fatal: settings just won't be remembered
  }
}