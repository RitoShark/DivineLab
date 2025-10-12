// Utility functions for consistent theme usage across components

// Get CSS variable value or fallback
export function getCSSVar(varName, fallback = '') {
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || fallback;
  }
  return fallback;
}

// Common theme-aware styles
export const themeStyles = {
  // Glass effect styles
  glass: {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    backdropFilter: 'saturate(180%) blur(16px)',
    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
    boxShadow: 'var(--glass-shadow)'
  },

  // Surface styles
  surface: {
    background: 'var(--surface)',
    border: '1px solid var(--bg)',
    color: 'var(--text)'
  },

  surface2: {
    background: 'var(--surface-2)',
    border: '1px solid var(--bg)',
    color: 'var(--text)'
  },

  // Button styles
  primaryButton: {
    background: 'var(--accent-gradient)',
    color: 'var(--surface)',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer'
  },

  secondaryButton: {
    background: 'var(--surface-2)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer'
  },

  // Input styles
  input: {
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--accent)',
    padding: '8px',
    borderRadius: '4px',
    width: '100%'
  },

  // Text styles
  primaryText: {
    color: 'var(--text)'
  },

  secondaryText: {
    color: 'var(--text-2)'
  },

  accentText: {
    color: 'var(--accent)'
  },

  // Container styles
  container: {
    background: 'var(--surface-gradient)',
    border: '2px solid var(--accent)',
    borderRadius: '8px',
    padding: '16px'
  },

  // Scrollbar styles
  scrollbar: {
    '::-webkit-scrollbar': {
      width: '8px'
    },
    '::-webkit-scrollbar-track': {
      background: 'var(--surface-2) !important'
    },
    '::-webkit-scrollbar-thumb': {
      background: 'var(--accent2) !important',
      borderRadius: '6px !important'
    },
    '::-webkit-scrollbar-thumb:hover': {
      background: 'var(--accent) !important'
    }
  }
};

// Helper function to create theme-aware inline styles
export function createThemeStyle(baseStyle = {}) {
  return {
    ...baseStyle,
    // Ensure CSS variables are available
    color: baseStyle.color || 'var(--text)',
    backgroundColor: baseStyle.backgroundColor || baseStyle.background || 'transparent'
  };
}

// Helper to get current theme colors (useful for canvas/dynamic content)
export function getCurrentThemeColors() {
  return {
    accent: getCSSVar('--accent'),
    accent2: getCSSVar('--accent2'),
    accentMuted: getCSSVar('--accent-muted'),
    bg: getCSSVar('--bg'),
    bg2: getCSSVar('--bg-2'),
    surface: getCSSVar('--surface'),
    surface2: getCSSVar('--surface-2'),
    text: getCSSVar('--text'),
    text2: getCSSVar('--text-2'),
    glassBg: getCSSVar('--glass-bg'),
    glassBorder: getCSSVar('--glass-border')
  };
}

export default {
  getCSSVar,
  themeStyles,
  createThemeStyle,
  getCurrentThemeColors
};