import React from 'react';
import './GlowingSpinner.css';

const GlowingSpinner = ({ text = 'Loading...' }) => {
  return (
    <div className="glow-spinner-overlay">
      <div className="glow-spinner-container">
        <div className="glow-spinner-ring" />
        <div className="glow-spinner-text">{text}</div>
      </div>
    </div>
  );
};

export default GlowingSpinner;


