import React, { useMemo, useState } from 'react';

const identityMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

const clampFinite = (v) => (Number.isFinite(v) ? v : 0);

const MatrixEditor = ({ open, initialMatrix, onApply, onClose }) => {
  const init = useMemo(() => (Array.isArray(initialMatrix) && initialMatrix.length >= 16 ? initialMatrix.slice(0, 16) : identityMatrix.slice()), [initialMatrix]);
  const [values, setValues] = useState(init);

  if (!open) return null;

  const setPreset = (arr) => setValues(arr.slice(0, 16));

  const handleChange = (idx, v) => {
    const next = values.slice();
    next[idx] = clampFinite(parseFloat(v));
    setValues(next);
  };

  const scalePreset = (s) => {
    const next = values.slice();
    next[0] = s; // X
    next[5] = s; // Y
    next[10] = s; // Z
    setValues(next);
  };

  const mirrorXZ = () => {
    const m = values.slice();
    m[0] = -Math.abs(m[0]);
    m[10] = -Math.abs(m[10]);
    setValues(m);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
             <div style={{ 
         width: 520, 
         maxWidth: '95vw', 
         background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', 
         border: '1px solid rgba(255,255,255,0.25)', 
         borderRadius: 10, 
         boxShadow: '0 20px 60px rgba(0,0,0,0.45)', 
         padding: 20,
         backdropFilter: 'blur(20px) saturate(200%)',
         WebkitBackdropFilter: 'blur(20px) saturate(200%)'
       }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, marginBottom: 12, color: 'var(--accent)', fontSize: '1.2rem' }}>Matrix Editor</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 8 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>4×4 Transform Matrix</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Row‑major</div>
        </div>
                 <div style={{ 
           display: 'grid', 
           gridTemplateColumns: 'repeat(4, 1fr)', 
           gap: 6, 
           marginBottom: 12, 
           background: 'rgba(255,255,255,0.08)', 
           border: '1px solid rgba(255,255,255,0.2)', 
           borderRadius: 8, 
           padding: 12,
           backdropFilter: 'blur(10px)',
           WebkitBackdropFilter: 'blur(10px)'
         }}>
          {values.map((val, i) => (
            <input 
              key={i} 
              type="number" 
              step="0.001" 
              value={val} 
              onChange={(e) => handleChange(i, e.target.value)} 
                             style={{ 
                 textAlign: 'center', 
                 fontFamily: 'JetBrains Mono, monospace', 
                 fontSize: 12, 
                 padding: '6px 4px', 
                 color: 'var(--accent)', 
                 background: 'var(--surface-2)', 
                 border: '1px solid rgba(255,255,255,0.14)', 
                 borderRadius: 6,
                 minWidth: 0,
                 width: '100%',
                 boxSizing: 'border-box'
               }} 
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="Input" onClick={() => setPreset(identityMatrix)} style={{ padding: '6px 10px', fontSize: '0.9rem' }}>Identity</button>
          <button className="Input" onClick={() => scalePreset(2)} style={{ padding: '6px 10px', fontSize: '0.9rem' }}>Scale 2×</button>
          <button className="Input" onClick={() => scalePreset(0.5)} style={{ padding: '6px 10px', fontSize: '0.9rem' }}>Scale 0.5×</button>
          <button className="Input" onClick={mirrorXZ} style={{ padding: '6px 10px', fontSize: '0.9rem' }}>Mirror XZ</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="Input" onClick={onClose} style={{ padding: '8px 16px', fontSize: '1rem' }}>Cancel</button>
          <button className="Input special-input" onClick={() => onApply(values.slice(0, 16))} style={{ padding: '8px 16px', fontSize: '1rem' }}>Apply</button>
        </div>
      </div>
    </div>
  );
};

export default MatrixEditor;


