import React from 'react';
import { createPortal } from 'react-dom';

/**
 * SpotlightOverlay
 * Dims the entire screen except a rectangular spotlight around the target rect.
 * Uses four fixed layers (top, left, right, bottom) to create a "hole" where the target is.
 *
 * Props:
 * - rect: { left: number, top: number, width: number, height: number } | null
 * - padding?: number (default 8)
 * - dimColor?: string (default 'rgba(0,0,0,0.55)')
 * - zIndex?: number (default 5000)
 */
const SpotlightOverlay = ({ rect, padding = 8, dimColor = 'rgba(0,0,0,0.55)', zIndex = 5000 }) => {
  if (!rect) return null;

  const { innerWidth: vw, innerHeight: vh } = window;
  const x = Math.max(0, rect.left - padding);
  const y = Math.max(0, rect.top - padding);
  const w = Math.min(vw - x, rect.width + padding * 2);
  const h = Math.min(vh - y, rect.height + padding * 2);

  // Regions around the hole
  const topStyle = {
    position: 'fixed', left: 0, top: 0, width: '100vw', height: y,
    background: dimColor, zIndex,
    pointerEvents: 'none',
  };
  const leftStyle = {
    position: 'fixed', left: 0, top: y, width: x, height: h,
    background: dimColor, zIndex,
    pointerEvents: 'none',
  };
  const rightStyle = {
    position: 'fixed', left: x + w, top: y, width: Math.max(0, vw - (x + w)), height: h,
    background: dimColor, zIndex,
    pointerEvents: 'none',
  };
  const bottomStyle = {
    position: 'fixed', left: 0, top: y + h, width: '100vw', height: Math.max(0, vh - (y + h)),
    background: dimColor, zIndex,
    pointerEvents: 'none',
  };

  const ringStyle = {
    position: 'fixed', left: x, top: y, width: w, height: h,
    borderRadius: 10,
    // Outer glow + inner glow
    boxShadow:
      '0 0 0 2px color-mix(in srgb, var(--accent), transparent 5%), 0 0 24px color-mix(in srgb, var(--accent), transparent 30%), inset 0 0 16px color-mix(in srgb, var(--accent), transparent 65%)',
    pointerEvents: 'none',
    zIndex: zIndex + 1,
  };

  return createPortal(
    <>
      <div style={topStyle} />
      <div style={leftStyle} />
      <div style={rightStyle} />
      <div style={bottomStyle} />
      <div style={ringStyle} />
    </>,
    document.body
  );
};

export default SpotlightOverlay;


