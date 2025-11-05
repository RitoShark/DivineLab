// Comprehensive theme manager that applies CSS variables to :root and provides MUI theme generation

const THEMES = {
  // Current main theme (purple + gold)
  amethyst: {
    accent: '#ecb96a', // gold
    accent2: '#c084fc', // purple
    accentMuted: '#ad7e34',
    bg: '#0b0a0f',
    bg2: '#2a2737',
    surface: '#0f0d14',
    surface2: '#2a2737',
    text: '#ecb96a',
    text2: '#c084fc',
    glassBg: 'rgba(16,14,22,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    // MUI specific colors
    muiPrimary: '#8b5cf6',
    muiPrimaryLight: '#a78bfa',
    muiPrimaryDark: '#6d28d9',
    muiSecondary: '#c084fc',
    muiSecondaryLight: '#d8b4fe',
    muiSecondaryDark: '#7c3aed',
    muiBackground: '#121212',
    muiPaper: '#1a1a1a',
    muiTextPrimary: '#ffffff',
    muiTextSecondary: '#ad7e34',
    muiDivider: '#333',
    // Green accent for success/ported states
    accentGreen: '#22c55e',
    accentGreenMuted: '#166534'
  },
  // bluePurple removed
  // Neutral theme
  onyx: {
    accent: '#9aa4ae',
    // Brighter secondary for clearer labels in Neutral theme
    accent2: '#cbd5e1',
    accentMuted: '#6b7280',
    bg: '#0f1115',
    bg2: '#151821',
    surface: '#131722',
    surface2: '#1b2130',
    text: '#e5e7eb',
    text2: '#cbd5e1',
    glassBg: 'rgba(15,17,23,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    // MUI specific colors
    muiPrimary: '#9aa4ae',
    muiPrimaryLight: '#b6bec7',
    muiPrimaryDark: '#6b7280',
    muiSecondary: '#64748b',
    muiSecondaryLight: '#cbd5e1',
    muiSecondaryDark: '#475569',
    muiBackground: '#0f1115',
    muiPaper: '#151821',
    muiTextPrimary: '#e5e7eb',
    muiTextSecondary: '#cbd5e1',
    muiDivider: '#2b3340',
    accentGreen: '#22c55e',
    accentGreenMuted: '#14532d'
  }
  ,
  // Neon theme (cyan + pink)
  neon: {
    accent: '#06b6d4',
    accent2: '#f472b6',
    accentMuted: '#0e7490',
    bg: '#0a0c12',
    bg2: '#121726',
    surface: '#0e121b',
    surface2: '#171d2b',
    text: '#a5f3fc',
    text2: '#fbcfe8',
    glassBg: 'rgba(10,12,18,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#06b6d4',
    muiPrimaryLight: '#67e8f9',
    muiPrimaryDark: '#0e7490',
    muiSecondary: '#f472b6',
    muiSecondaryLight: '#f9a8d4',
    muiSecondaryDark: '#be185d',
    muiBackground: '#0a0c12',
    muiPaper: '#121726',
    muiTextPrimary: '#e5faff',
    muiTextSecondary: '#fbcfe8',
    muiDivider: '#2a3144',
    accentGreen: '#34d399',
    accentGreenMuted: '#065f46'
  },
  // Aurora theme (mint + lime)
  aurora: {
    accent: '#34d399',
    accent2: '#a3e635',
    accentMuted: '#059669',
    bg: '#0c1110',
    bg2: '#121a18',
    surface: '#0f1615',
    surface2: '#16201d',
    text: '#d1fae5',
    text2: '#ecfccb',
    glassBg: 'rgba(12,17,16,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#34d399',
    muiPrimaryLight: '#6ee7b7',
    muiPrimaryDark: '#059669',
    muiSecondary: '#a3e635',
    muiSecondaryLight: '#bef264',
    muiSecondaryDark: '#65a30d',
    muiBackground: '#0c1110',
    muiPaper: '#121a18',
    muiTextPrimary: '#e7fff5',
    muiTextSecondary: '#eaffd1',
    muiDivider: '#26332f',
    accentGreen: '#34d399',
    accentGreenMuted: '#065f46'
  },
  // Solar theme (orange + gold)
  solar: {
    accent: '#f59e0b',
    accent2: '#fde68a',
    accentMuted: '#b45309',
    bg: '#0e0c0a',
    bg2: '#1a140d',
    surface: '#120f0b',
    surface2: '#1b160e',
    text: '#fde68a',
    text2: '#fcd34d',
    glassBg: 'rgba(18,15,11,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#f59e0b',
    muiPrimaryLight: '#fbbf24',
    muiPrimaryDark: '#b45309',
    muiSecondary: '#fde68a',
    muiSecondaryLight: '#fef3c7',
    muiSecondaryDark: '#f59e0b',
    muiBackground: '#0e0c0a',
    muiPaper: '#1a140d',
    muiTextPrimary: '#fff7d6',
    muiTextSecondary: '#fee9a6',
    muiDivider: '#3a2e1f',
    accentGreen: '#84cc16',
    accentGreenMuted: '#3f6212'
  },
  // midnight removed
  // Charcoal Olive theme (graphite → olive gradient)
  charcoalOlive: {
    accent: '#b7bdbd',
    // Brighter secondary for better label readability across UI
    accent2: '#b2ad85',
    // Use the second gradient stop as the muted accent to preserve the requested gradient
    accentMuted: '#605C3C',
    bg: '#0b0c0d',
    bg2: '#151617',
    surface: '#101112',
    surface2: '#181a1b',
    // Readable warm-gray text colors tuned for the dark background
    text: '#e6e3d9',
    text2: '#cfc9b0',
    glassBg: 'rgba(16,17,18,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    // MUI specific colors
    muiPrimary: '#b7bdbd',
    muiPrimaryLight: '#d2d6d6',
    muiPrimaryDark: '#8e9494',
    muiSecondary: '#86836A',
    muiSecondaryLight: '#d0cba3',
    muiSecondaryDark: '#605C3C',
    muiBackground: '#0b0c0d',
    muiPaper: '#151617',
    muiTextPrimary: '#f0ede3',
    muiTextSecondary: '#e6e3d9',
    muiDivider: '#2b2c2d',
    accentGreen: '#22c55e',
    accentGreenMuted: '#14532d'
  },
  // Divine Lab theme (inspired by the flask + galaxy icon)
  quartz: {
    accent: '#f8fafc', // laboratory white (flask color)
    accent2: '#c0c5ce', // light grey (flask liquid)
    accentMuted: '#cbd5e1', // muted grey
    bg: '#020617', // much darker deep space black
    bg2: '#0f172a', // darker cosmic slate
    surface: '#0f172a', // darker laboratory surface
    surface2: '#1e293b', // darker slate grey
    text: '#f8fafc', // pure white (flask highlight)
    text2: '#e2e8f0', // light grey
    glassBg: 'rgba(15,23,42,0.35)',
    glassBorder: 'rgba(248,250,252,0.15)',
    glassShadow: '0 12px 28px rgba(248,250,252,0.10)',
    // MUI specific colors
    muiPrimary: '#f8fafc',
    muiPrimaryLight: '#ffffff',
    muiPrimaryDark: '#e2e8f0',
    muiSecondary: '#e2e8f0',
    muiSecondaryLight: '#f1f5f9',
    muiSecondaryDark: '#cbd5e1',
    muiBackground: '#020617',
    muiPaper: '#0f172a',
    muiTextPrimary: '#f8fafc',
    muiTextSecondary: '#e2e8f0',
    muiDivider: '#1e293b',
    // Green accent for success/ported states (lab success indicator)
    accentGreen: '#10b981',
    accentGreenMuted: '#047857'
  },
  // Futurist Quartz theme (inspired by natural quartz stone - rose, clear, and smoky tones)
  futuristQuartz: {
    accent: '#f8d7d9', // soft rose quartz pink (like rose quartz)
    accent2: '#e8d5d0', // pale smoky quartz gray-pink
    accentMuted: '#d4a5a8', // deeper rose quartz
    bg: '#0f0d0f', // deep stone black (like quartz base)
    bg2: '#1a181a', // smoky quartz dark gray
    surface: '#141214', // quartz crystal dark surface
    surface2: '#1f1d1f', // lighter smoky quartz
    text: '#f5e6e8', // pale rose-white (quartz crystal clarity)
    text2: '#e8d5d0', // soft smoky pink-gray
    glassBg: 'rgba(20,18,20,0.40)',
    glassBorder: 'rgba(248,215,217,0.20)',
    glassShadow: '0 12px 32px rgba(248,215,217,0.12)',
    // MUI specific colors
    muiPrimary: '#f8d7d9',
    muiPrimaryLight: '#fce8e9',
    muiPrimaryDark: '#d4a5a8',
    muiSecondary: '#e8d5d0',
    muiSecondaryLight: '#f0e5e0',
    muiSecondaryDark: '#c4b5b0',
    muiBackground: '#0f0d0f',
    muiPaper: '#141214',
    muiTextPrimary: '#f5e6e8',
    muiTextSecondary: '#e8d5d0',
    muiDivider: '#2a262a',
    // Green accent for success/ported states (natural stone green)
    accentGreen: '#9db4a8',
    accentGreenMuted: '#6b8a7a'
  },
  // Cyber Quartz theme (cyberpunk crystal aesthetic)
  cyberQuartz: {
    accent: '#00d9ff', // bright cyan (quartz crystal glow)
    accent2: '#a855f7', // vibrant purple (futuristic tech accent)
    accentMuted: '#0099cc', // deep cyan
    bg: '#0a0f1a', // deep blue-black (void)
    bg2: '#0f1a2e', // dark blue slate
    surface: '#0d1526', // tech surface dark blue
    surface2: '#152238', // elevated tech surface
    text: '#e0f2fe', // bright cyan-white (crystal light)
    text2: '#c4b5fd', // light purple-cyan
    glassBg: 'rgba(13,21,38,0.40)',
    glassBorder: 'rgba(0,217,255,0.25)',
    glassShadow: '0 12px 32px rgba(0,217,255,0.15)',
    // MUI specific colors
    muiPrimary: '#00d9ff',
    muiPrimaryLight: '#33e0ff',
    muiPrimaryDark: '#0099cc',
    muiSecondary: '#a855f7',
    muiSecondaryLight: '#c084fc',
    muiSecondaryDark: '#7c3aed',
    muiBackground: '#0a0f1a',
    muiPaper: '#0d1526',
    muiTextPrimary: '#e0f2fe',
    muiTextSecondary: '#c4b5fd',
    muiDivider: '#1a2744',
    // Green accent for success/ported states (neon success)
    accentGreen: '#00ff88',
    accentGreenMuted: '#00cc6a'
  }
};

// Optional Electron preferences import (guarded)
let electronPrefs;
try {
  // eslint-disable-next-line no-undef
  if (typeof window !== 'undefined' && window.require) {
    electronPrefs = require('./electronPrefs').default;
  } else {
    // Fallback to ESM import in bundlers
    // This may fail in some environments; we guard all usages
    electronPrefs = undefined;
  }
} catch {
  electronPrefs = undefined;
}

function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value.trim());
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function darkenHex(hex, amount = 0.2) {
  if (!isHexColor(hex)) return hex;
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.round(r * (1 - clamp01(amount)));
  const dg = Math.round(g * (1 - clamp01(amount)));
  const db = Math.round(b * (1 - clamp01(amount)));
  return rgbToHex(dr, dg, db);
}

function withAlpha(hex, alpha = 0.35) {
  if (!isHexColor(hex)) return hex;
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function normalizeThemeObject(input) {
  const theme = { ...input };
  // Derive missing fields from provided basics
  if (!theme.accentMuted && theme.accent) theme.accentMuted = darkenHex(theme.accent, 0.35);
  if (!theme.bg2 && theme.bg) theme.bg2 = darkenHex(theme.bg, 0.15);
  if (!theme.surface && theme.bg) theme.surface = darkenHex(theme.bg, 0.1);
  if (!theme.surface2 && theme.surface) theme.surface2 = darkenHex(theme.surface, 0.15);
  if (!theme.text && theme.accent) theme.text = theme.accent;
  if (!theme.text2 && theme.accent2) theme.text2 = theme.accent2;
  if (!theme.glassBg) theme.glassBg = withAlpha(theme.surface || theme.bg || '#0b0a0f', 0.35);
  if (!theme.glassBorder) theme.glassBorder = 'rgba(255,255,255,0.10)';
  if (!theme.glassShadow) theme.glassShadow = '0 12px 28px rgba(0,0,0,0.35)';
  return theme;
}

export function applyThemeFromObject(themeObject = {}) {
  const t = normalizeThemeObject(themeObject);
  const root = document.documentElement;
  // Preserve any current data-theme attribute for CSS overrides; set to 'custom'
  root.setAttribute('data-theme', 'custom');

  // Core theme variables
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent2', t.accent2);
  root.style.setProperty('--accent-muted', t.accentMuted);
  if (t.accentGreen) root.style.setProperty('--accent-green', t.accentGreen);
  if (t.accentGreenMuted) root.style.setProperty('--accent-green-muted', t.accentGreenMuted);
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--bg-2', t.bg2);
  root.style.setProperty('--surface', t.surface);
  root.style.setProperty('--surface-2', t.surface2);
  root.style.setProperty('--text', t.text);
  root.style.setProperty('--text-2', t.text2);
  root.style.setProperty('--glass-bg', t.glassBg);
  root.style.setProperty('--glass-border', t.glassBorder);
  root.style.setProperty('--glass-shadow', t.glassShadow);

  // Gradients
  root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${t.accent}, ${t.accentMuted})`);
  root.style.setProperty('--accent-gradient-subtle', `linear-gradient(135deg, ${t.accent}33, ${t.accentMuted}33)`);
  root.style.setProperty('--surface-gradient', `linear-gradient(135deg, ${t.surface2} 0%, ${t.bg} 100%)`);
}

export function applyThemeVariables(variant = 'amethyst') {
  // Handle custom variant reference like 'custom:MyTheme'
  if (typeof variant === 'string' && variant.startsWith('custom:') && electronPrefs && electronPrefs.obj) {
    const name = variant.slice('custom:'.length);
    const all = electronPrefs.obj.CustomThemes || {};
    const t = all[name];
    if (t) {
      applyThemeFromObject(t);
      return;
    }
  }
  const theme = THEMES[variant] || THEMES.amethyst;
  const root = document.documentElement;
  const appliedVariant = THEMES[variant] ? variant : 'amethyst';
  root.setAttribute('data-theme', appliedVariant);
  
  // Core theme variables
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent2', theme.accent2);
  root.style.setProperty('--accent-muted', theme.accentMuted);
  root.style.setProperty('--accent-green', theme.accentGreen || theme.accent);
  root.style.setProperty('--accent-green-muted', theme.accentGreenMuted || theme.accentMuted);
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--bg-2', theme.bg2);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--surface-2', theme.surface2);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--text-2', theme.text2);
  root.style.setProperty('--glass-bg', theme.glassBg);
  root.style.setProperty('--glass-border', theme.glassBorder);
  root.style.setProperty('--glass-shadow', theme.glassShadow);
  
  // MUI specific variables
  root.style.setProperty('--mui-primary', theme.muiPrimary);
  root.style.setProperty('--mui-primary-light', theme.muiPrimaryLight);
  root.style.setProperty('--mui-primary-dark', theme.muiPrimaryDark);
  root.style.setProperty('--mui-secondary', theme.muiSecondary);
  root.style.setProperty('--mui-secondary-light', theme.muiSecondaryLight);
  root.style.setProperty('--mui-secondary-dark', theme.muiSecondaryDark);
  root.style.setProperty('--mui-background', theme.muiBackground);
  root.style.setProperty('--mui-paper', theme.muiPaper);
  root.style.setProperty('--mui-text-primary', theme.muiTextPrimary);
  root.style.setProperty('--mui-text-secondary', theme.muiTextSecondary);
  root.style.setProperty('--mui-divider', theme.muiDivider);
  
  // Gradients
  root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${theme.accent}, ${theme.accentMuted})`);
  root.style.setProperty('--accent-gradient-subtle', `linear-gradient(135deg, ${theme.accent}33, ${theme.accentMuted}33)`);
  root.style.setProperty('--surface-gradient', `linear-gradient(135deg, ${theme.surface2} 0%, ${theme.bg} 100%)`);
}

// Get current theme object
export function getCurrentTheme(variant = 'amethyst') {
  return THEMES[variant] || THEMES.amethyst;
}

// Get all available theme names
export function getAvailableThemes() {
  return Object.keys(THEMES);
}

export function getCustomThemes() {
  try {
    if (electronPrefs && electronPrefs.obj) {
      return electronPrefs.obj.CustomThemes || {};
    }
  } catch {}
  return {};
}

export async function setCustomTheme(name, themeObject) {
  if (!name) return;
  try {
    if (!electronPrefs) return;
    await electronPrefs.initPromise;
    const current = electronPrefs.obj.CustomThemes || {};
    current[name] = normalizeThemeObject(themeObject || {});
    electronPrefs.obj.CustomThemes = current;
    await electronPrefs.save();
  } catch (e) {
    // noop
  }
}

export async function deleteCustomTheme(name) {
  try {
    if (!electronPrefs) return;
    await electronPrefs.initPromise;
    const current = electronPrefs.obj.CustomThemes || {};
    if (current[name]) {
      delete current[name];
      electronPrefs.obj.CustomThemes = current;
      await electronPrefs.save();
    }
  } catch (e) {
    // noop
  }
}

export default { applyThemeVariables, applyThemeFromObject, getCustomThemes, setCustomTheme, deleteCustomTheme };


