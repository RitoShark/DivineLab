import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import SpotlightOverlay from './SpotlightOverlay';

/**
 * CelestiaGuide
 * A reusable, bottom-right guide/tour component for Celestia.
 *
 * Props:
 * - id: string (unique id used for persistence key)
 * - steps: Array<{
 *     title: string,
 *     text: string,
 *     ctaLabel?: string,
 *     ctaPath?: string,
 *     ctaUrl?: string,
 *     targetSelector?: string,
 *     padding?: number,
 *   }>
 * - onClose?: () => void
 * - onStepChange?: (stepIndex: number) => void
 */
const CelestiaGuide = ({ id, steps = [], onClose, onSkipToTop, onStepChange }) => {
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const scrollLockRef = useRef(null);
  const [celestiaSrc, setCelestiaSrc] = useState(`${process.env.PUBLIC_URL}/celestia.webp`);

  // Get celestia image source, checking AppData/FrogTools/assets first
  useEffect(() => {
    const getCelestiaSrc = () => {
      if (!window.require) {
        return `${process.env.PUBLIC_URL}/celestia.webp`;
      }
      
      try {
        const path = window.require('path');
        const fs = window.require('fs');
        
        // Check app installation directory assets folder first (user can replace this file)
        const appPath = path.dirname(process.execPath);
        const userCelestiaPath = path.join(appPath, 'assets', 'celestia.webp');
        
        if (fs.existsSync(userCelestiaPath)) {
          try {
            const fileBuffer = fs.readFileSync(userCelestiaPath);
            const ext = path.extname(userCelestiaPath).toLowerCase();
            const mimeType = ext === '.webp' ? 'image/webp' : 
                            ext === '.png' ? 'image/png' :
                            ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp';
            const base64 = fileBuffer.toString('base64');
            setCelestiaSrc(`data:${mimeType};base64,${base64}`);
            return;
          } catch (error) {
            console.error('Error reading user celestia image:', error);
          }
        }
        
        // Check resources/assets (bundled default)
        if (process.resourcesPath) {
          const resourcesCelestiaPath = path.join(process.resourcesPath, 'assets', 'celestia.webp');
          if (fs.existsSync(resourcesCelestiaPath)) {
            try {
              const fileBuffer = fs.readFileSync(resourcesCelestiaPath);
              const base64 = fileBuffer.toString('base64');
              setCelestiaSrc(`data:image/webp;base64,${base64}`);
              return;
            } catch (error) {
              console.error('Error reading resources celestia image:', error);
            }
          }
        }
        
        // Fallback to default
        setCelestiaSrc(`${process.env.PUBLIC_URL}/celestia.webp`);
      } catch (error) {
        console.error('Error getting celestia source:', error);
        setCelestiaSrc(`${process.env.PUBLIC_URL}/celestia.webp`);
      }
    };
    
    getCelestiaSrc();
  }, []);

  const total = steps.length;
  const current = steps[stepIndex] || {};

  const storageKey = useMemo(() => `celestiaGuideSeen:${id}`, [id]);

  useEffect(() => {
    const enterId = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(enterId);
  }, []);

  const finish = () => {
    try { localStorage.setItem(storageKey, '1'); } catch {}
    // Let host (MainPage) handle any scroll positioning if desired
    // We intentionally avoid internal scroll restoration now
    setExiting(true);
    setTimeout(() => onClose && onClose(), 500);
  };

  const handleNext = () => {
    if (stepIndex < total - 1) {
      const newIndex = stepIndex + 1;
      setStepIndex(newIndex);
      if (onStepChange) onStepChange(newIndex);
    } else {
      finish();
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      const newIndex = stepIndex - 1;
      setStepIndex(newIndex);
      if (onStepChange) onStepChange(newIndex);
    }
  };

  const handleSkip = () => finish();

  const handleCta = () => {
    if (!current) return;
    if (current.ctaUrl) {
      if (window.require) {
        try {
          const { shell } = window.require('electron');
          shell.openExternal(current.ctaUrl);
        } catch {
          window.open(current.ctaUrl, '_blank');
        }
      } else {
        window.open(current.ctaUrl, '_blank');
      }
    } else if (current.ctaPath && window?.location) {
      // Prefer SPA navigation if available
      try {
        const navEvent = new CustomEvent('celestia:navigate', { detail: { path: current.ctaPath } });
        window.dispatchEvent(navEvent);
      } catch {}
    }
  };

  // Notify parent of step changes
  useEffect(() => {
    if (onStepChange) {
      onStepChange(stepIndex);
    }
  }, [stepIndex, onStepChange]);

  // Compute and scroll to target element
  useEffect(() => {
    const step = steps[stepIndex];
    if (!step || !step.targetSelector) {
      setTargetRect(null);
      return;
    }
    const element = document.querySelector(step.targetSelector);
    if (!element) {
      setTargetRect(null);
      return;
    }

    // Don't scroll - just update rect
    const updateRect = () => {
      const rect = element.getBoundingClientRect();
      // For step 7, ensure we're getting the correct position after settings panel opens
      setTargetRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, padding: step.padding ?? 10 });
    };
    
    // For step 7 (index 6), wait for settings panel animation to complete (300ms transition)
    if (stepIndex === 6) {
      // Wait for settings panel to fully expand before calculating highlight
      // Settings should already be open from step 6, but wait to ensure DOM is updated
      const timer = setTimeout(() => {
        updateRect();
        // Update again after a short delay to ensure it's correct after all transitions
        setTimeout(updateRect, 100);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      updateRect();
    }

    // Keep rect updated on resize/scroll
    const onResize = () => updateRect();
    const onScroll = () => updateRect();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [stepIndex, steps]);

  // Determine if we should position at top-right (for steps 5, 6, and 7, indices 4, 5, and 6)
  const isTopRight = stepIndex === 4 || stepIndex === 5 || stepIndex === 6;
  
  const guideContent = (
    <div
      className={
        `fixed ${isTopRight ? 'top-4' : 'bottom-4'} right-4 z-50 flex ${isTopRight ? 'items-start' : 'items-end'} gap-4 transform will-change-transform will-change-opacity ` +
        `transition-all duration-700 ease-in-out ` +
        `${entered && !exiting ? 'translate-x-0 opacity-100' : ''} ` +
        `${!entered ? 'translate-x-full opacity-0' : ''} ` +
        `${exiting ? 'translate-x-full opacity-0' : ''}`
      }
      style={{ zIndex: 6000 }}
    >
      {/* Spotlight overlay */}
      <SpotlightOverlay rect={targetRect} padding={targetRect?.padding ?? 10} />

      {/* Speech bubble */}
      <div
        className="relative bg-gradient-to-br from-[#0f0e13] via-[#1a1825] to-[#25222f] rounded-2xl border border-[#a855f7]/50 shadow-2xl backdrop-blur-sm w-96 p-4 pr-10 flex flex-col"
        style={{ position: 'relative', zIndex: 9000, minHeight: 180, order: isTopRight ? 1 : 2 }}
      >
        {/* Close */}
        <button
          onClick={() => {
            // Trigger same behavior as clicking the floating "!" without opening UI
            if (typeof onSkipToTop === 'function') {
              try { onSkipToTop(); } catch {}
            }
            handleSkip();
          }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#e53e3e] transition-colors"
          aria-label="Close"
        >
          <X size={14} />
        </button>

        {/* Decorative top bar */}
        <div className="absolute -top-1 left-4 right-4 h-1.5 rounded-full bg-gradient-to-r from-[#a855f7] via-[#c084fc] to-[#a855f7]" />

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2.5 h-2.5 bg-[#fbbf24] rounded-full animate-pulse shadow-lg" />
          <h3 className="text-[#fbbf24] font-semibold text-xs tracking-wide">Guide</h3>
          <div className="ml-auto text-[10px] text-gray-300/80">Step {stepIndex + 1} of {total}</div>
        </div>

        <div className="mb-1 text-[#ecb96a] font-semibold text-sm">{current.title}</div>
        <p className="text-[#f3f4f6] text-sm leading-relaxed">{current.text}</p>

        {/* Actions */}
        <div className="mt-auto pt-2 flex items-center gap-2 flex-nowrap">
          <button
            onClick={handlePrev}
            disabled={stepIndex === 0}
            className={`px-2 py-1 h-7 leading-none whitespace-nowrap rounded-full border text-xs flex items-center gap-1 transition ` +
              `${stepIndex === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10'}`}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <button
            onClick={handleNext}
            className="px-3 py-1 h-7 leading-none whitespace-nowrap rounded-full border border-[#a855f7]/60 bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1"
          >
            {stepIndex < total - 1 ? 'Next' : 'Finish'} <ChevronRight size={14} />
          </button>
          {/* CTA button intentionally removed per UX decision; users will use main UI buttons */}
          <button
            onClick={() => {
              if (typeof onSkipToTop === 'function') {
                try { onSkipToTop(); } catch {}
              }
              handleSkip();
            }}
            className="ml-auto h-7 leading-none whitespace-nowrap text-[11px] text-gray-300/80 hover:text-white"
          >
            Skip tour
          </button>
        </div>

        {/* Tail pointer - points towards character */}
        {isTopRight ? (
          <div className="absolute right-0 top-6 translate-x-full w-0 h-0 border-t-8 border-b-8 border-l-8 border-t-transparent border-b-transparent border-l-[#1a1825]" />
        ) : (
          <div className="absolute left-0 bottom-6 -translate-x-full w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-[#1a1825]" />
        )}
      </div>

      {/* Character */}
      <div className="relative" style={{ position: 'relative', zIndex: 9000, order: isTopRight ? 2 : 1 }}>
        <img
          src={celestiaSrc || `${process.env.PUBLIC_URL}/celestia.webp`}
          alt="Celestial"
          className="w-48 h-48 object-contain drop-shadow-2xl brightness-110 contrast-110"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.className = 'w-24 h-24 flex items-center justify-center text-6xl';
            fallback.textContent = '✨';
            e.currentTarget.parentElement.appendChild(fallback);
          }}
        />
        <div className="absolute inset-0 rounded-full blur-2xl -z-10 bg-gradient-to-br from-[#783CB5]/30 via-[#9333ea]/20 to-[#a855f7]/30" />
        <div className="absolute top-2 right-2 w-8 h-8 bg-gradient-to-br from-[#34d399] to-[#10b981] rounded-full flex items-center justify-center text-lg font-bold text-black animate-bounce border border-white/70 shadow-lg">
          {stepIndex + 1}
        </div>
      </div>
    </div>
  );

  // Render the entire guide into body so it sits above any parent stacking contexts
  return createPortal(guideContent, document.body);
};

export default CelestiaGuide;


