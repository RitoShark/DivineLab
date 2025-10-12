import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const CelestialWelcome = ({ onClose }) => {
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const enterId = setTimeout(() => setEntered(true), 20);
    const timerId = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onClose && onClose(), 700);
    }, 5000);
    return () => {
      clearTimeout(enterId);
      clearTimeout(timerId);
    };
  }, [onClose]);

  return (
    <div
      className={
        `fixed bottom-4 right-4 z-50 flex items-end gap-4 transform will-change-transform will-change-opacity ` +
        `transition-all duration-700 ease-in-out ` +
        `${entered && !exiting ? 'translate-x-0 opacity-100' : ''} ` +
        `${!entered ? 'translate-x-full opacity-0' : ''} ` +
        `${exiting ? 'translate-x-full opacity-0' : ''}`
      }
    >
      {/* Character */}
      <div className="relative">
        <img
          src={`${process.env.PUBLIC_URL}/celestia.webp`}
          alt="Celestial"
          className="w-48 h-48 object-contain drop-shadow-2xl brightness-110 contrast-110"
          onError={(e) => {
            // Fallback to emoji sparkles
            e.currentTarget.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.className = 'w-24 h-24 flex items-center justify-center text-6xl';
            fallback.textContent = '✨';
            e.currentTarget.parentElement.appendChild(fallback);
          }}
        />
        {/* Subtle glow */}
        <div className="absolute inset-0 rounded-full blur-2xl -z-10 bg-gradient-to-br from-[#783CB5]/30 via-[#9333ea]/20 to-[#a855f7]/30" />
        {/* Quest indicator */}
        <div className="absolute top-2 right-2 w-8 h-8 bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] rounded-full flex items-center justify-center text-lg font-bold text-black animate-bounce border border-white/70 shadow-lg">
          !
        </div>
        {/* Floating magical particles */}
        <div className="absolute top-6 left-16 w-2 h-2 bg-[#c084fc] rounded-full animate-ping" />
        <div className="absolute top-20 left-4 w-1.5 h-1.5 bg-[#fbbf24] rounded-full animate-ping delay-700" />
        <div className="absolute bottom-12 right-8 w-2 h-2 bg-[#a855f7] rounded-full animate-ping delay-1000" />
        <div className="absolute bottom-28 right-2 w-1 h-1 bg-[#c084fc] rounded-full animate-ping delay-1500" />
      </div>

      {/* Speech bubble */}
      <div className="relative bg-gradient-to-br from-[#0f0e13] via-[#1a1825] to-[#25222f] rounded-2xl border border-[#a855f7]/50 shadow-2xl backdrop-blur-sm w-80 p-4 pr-8">
        {/* Close */}
        <button
          onClick={() => {
            setExiting(true);
            setTimeout(() => onClose && onClose(), 700);
          }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#e53e3e] transition-colors"
          aria-label="Close"
        >
          <X size={14} />
        </button>

        {/* Decorative top bar */}
        <div className="absolute -top-1 left-4 right-4 h-1.5 rounded-full bg-gradient-to-r from-[#a855f7] via-[#c084fc] to-[#a855f7]" />

        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 bg-[#fbbf24] rounded-full animate-pulse shadow-lg" />
          <h3 className="text-[#fbbf24] font-semibold text-xs tracking-wide">Welcome</h3>
        </div>

        <p className="text-[#f3f4f6] text-sm leading-relaxed">Hello, welcome to DivineLab!</p>

        {/* Tail pointer */}
        <div className="absolute right-0 bottom-6 translate-x-full w-0 h-0 border-t-8 border-b-8 border-l-8 border-t-transparent border-b-transparent border-l-[#1a1825]" />
      </div>
    </div>
  );
};

export default CelestialWelcome;


