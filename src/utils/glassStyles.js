// Reusable glass effect styles driven by theme CSS variables

export const glassSurface = {
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  backdropFilter: 'saturate(180%) blur(16px)',
  WebkitBackdropFilter: 'saturate(180%) blur(16px)',
  borderRadius: 12,
  boxShadow: 'var(--glass-shadow)'
};

export const glassPanel = {
  ...glassSurface,
  borderRadius: 16,
  padding: 12,
};

export const glassButton = {
  background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
  border: '1px solid color-mix(in srgb, var(--accent2), transparent 72%)',
  backdropFilter: 'saturate(180%) blur(16px)',
  WebkitBackdropFilter: 'saturate(180%) blur(16px)',
  color: 'var(--text)',
  borderRadius: 999,
  boxShadow: 'var(--glass-shadow)',
  transition: 'all 0.25s ease',
  isolation: 'isolate',
  position: 'relative',
  overflow: 'hidden',
  '&:hover': {
    background: 'color-mix(in srgb, var(--accent2), transparent 82%)',
    borderColor: 'color-mix(in srgb, var(--accent2), transparent 66%)',
    transform: 'translateY(-2px)',
    boxShadow: '0 14px 34px rgba(0,0,0,0.45)'
  }
};

export const glassButtonOutlined = {
  background: 'color-mix(in srgb, var(--accent2), transparent 92%)',
  border: '1px solid color-mix(in srgb, var(--accent2), transparent 72%)',
  backdropFilter: 'saturate(180%) blur(16px)',
  WebkitBackdropFilter: 'saturate(180%) blur(16px)',
  color: 'var(--text)',
  borderRadius: 999,
  transition: 'all 0.25s ease',
  isolation: 'isolate',
  position: 'relative',
  overflow: 'hidden',
  '&:hover': {
    background: 'color-mix(in srgb, var(--accent2), transparent 86%)',
    borderColor: 'color-mix(in srgb, var(--accent2), transparent 62%)',
    color: 'var(--text)',
    transform: 'translateY(-2px)'
  }
};

export const glassChip = {
  ...glassSurface,
  borderRadius: 999
};





