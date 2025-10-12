// Utilities for parsing, formatting, and inserting 4x4 transform matrices (mtx44)

/**
 * Escape a string for safe use inside RegExp constructor
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parse a system's transform matrix from its VfxSystemDefinitionData text block
 * Returns { matrix: number[] | null, start: number, end: number, indent: string, propName: string }
 * - start and end are indices in lines array where the transform block starts/ends (inclusive)
 * - indent is the indentation for the property line
 */
export const parseSystemMatrix = (systemContent) => {
  if (!systemContent || typeof systemContent !== 'string') {
    return { matrix: null, start: -1, end: -1, indent: '', propName: 'transform' };
  }

  const lines = systemContent.split('\n');
  const propPattern = /(\s*)(transform|Transform)\s*:\s*mtx44\s*=\s*\{/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(propPattern);
    if (!m) continue;

    const indent = m[1] || '';
    const propName = m[2] || 'transform';

    // Collect until closing brace at same or less indent depth
    const values = [];
    let end = i;
    for (let j = i + 1; j < lines.length && j < i + 12; j++) {
      const l = lines[j].trim();
      if (l === '}') { end = j; break; }
      // Extract numbers from this row (expect 4 numbers per row)
      const nums = l
        .replace(/\{\s*|\s*\}/g, '')
        .split(',')
        .map(v => parseFloat(v.trim()))
        .filter(v => Number.isFinite(v));
      values.push(...nums);
    }

    if (values.length >= 16) {
      return {
        matrix: values.slice(0, 16),
        start: i,
        end,
        indent,
        propName
      };
    }
  }

  return { matrix: null, start: -1, end: -1, indent: '', propName: 'transform' };
};

/**
 * Format an mtx44 block with the provided matrix and indentation
 */
export const formatMtx44 = (matrix, indent = '', propName = 'transform') => {
  const m = Array.isArray(matrix) && matrix.length >= 16 ? matrix : [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
  const row = (r) => m.slice(r * 4, r * 4 + 4).join(', ');
  const lines = [];
  lines.push(`${indent}${propName}: mtx44 = {`);
  lines.push(`${indent}    ${row(0)}`);
  lines.push(`${indent}    ${row(1)}`);
  lines.push(`${indent}    ${row(2)}`);
  lines.push(`${indent}    ${row(3)}`);
  lines.push(`${indent}}`);
  return lines.join('\n');
};

/**
 * Upsert a transform matrix into a system's text block
 * - If a matrix exists, replace it
 * - Else, insert after particlePath/particleName if present, otherwise after header line
 */
export const upsertSystemMatrix = (systemContent, matrix) => {
  if (!systemContent || typeof systemContent !== 'string') return systemContent || '';

  const { matrix: existing, start, end, indent, propName } = parseSystemMatrix(systemContent);
  const formatted = formatMtx44(matrix, indent || '    ', propName);
  const lines = systemContent.split('\n');

  if (existing && start >= 0 && end >= start) {
    // Replace existing block
    const before = lines.slice(0, start);
    const after = lines.slice(end + 1);
    return [...before, formatted, ...after].join('\n');
  }

  // Insert new block
  // Determine base indent by finding a common property line
  let insertIndex = -1;
  let baseIndent = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/\bparticlePath:\s*string\s*=/.test(l)) { insertIndex = i + 1; baseIndent = (l.match(/^(\s*)/) || ['',''])[1]; break; }
  }
  if (insertIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/\bparticleName:\s*string\s*=/.test(l)) { insertIndex = i + 1; baseIndent = (l.match(/^(\s*)/) || ['',''])[1]; break; }
    }
  }
  // Prefer inserting before sound/flags if present (keeps stylistic grouping consistent)
  if (insertIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/\bsound[A-Za-z]*Default\s*:\s*string\s*=/.test(l) || /\bflags\s*:\s*u16\s*=/.test(l)) {
        insertIndex = i; // insert before this line
        baseIndent = (l.match(/^(\s*)/) || ['',''])[1];
        break;
      }
    }
  }
  if (insertIndex === -1) {
    // After header line (first line is header)
    insertIndex = 1;
    // Infer indent from the next line or default to 4 spaces
    baseIndent = (lines[1] && (lines[1].match(/^(\s*)/) || ['',''])[1]) || '    ';
  }

  const block = formatMtx44(matrix, baseIndent, 'transform');
  const before = lines.slice(0, insertIndex);
  const after = lines.slice(insertIndex);
  return [...before, block, ...after].join('\n');
};

/**
 * Replace a single VfxSystemDefinitionData block identified by systemKey in full file content
 */
export const replaceSystemBlockInFile = (fullContent, systemKey, newSystemContent) => {
  if (!fullContent || !systemKey || !newSystemContent) return fullContent || '';
  const lines = fullContent.split('\n');
  const headerRe = new RegExp(`^\\s*\"?${escapeRegex(systemKey)}\"?\\s*=\\s*VfxSystemDefinitionData\\s*\\{`);

  for (let i = 0; i < lines.length; i++) {
    if (!headerRe.test(lines[i])) continue;
    // Found header; find end by bracket matching
    let depth = 1;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      const opens = (l.match(/\{/g) || []).length;
      const closes = (l.match(/\}/g) || []).length;
      depth += opens - closes;
      if (depth <= 0) { end = j; break; }
    }
    const before = lines.slice(0, i);
    const after = lines.slice(end + 1);
    return [...before, ...newSystemContent.split('\n'), ...after].join('\n');
  }

  return fullContent;
};


