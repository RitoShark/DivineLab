// Legacy utility functions for compatibility
const fs = require('fs');
const path = require('path');

// Preferences system
const prefsPath = path.join(__dirname, '..', 'preferences.json');

const loadPrefs = () => {
  try {
    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading preferences:', error);
  }
  return {};
};

const savePrefs = (prefs) => {
  try {
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.error('Error saving preferences:', error);
  }
};

const Prefs = {
  obj: loadPrefs(),
  PreferredMode: () => Prefs.obj.PreferredMode || 'random',
  Targets: () => Prefs.obj.Targets || [false, false, false, false, true],
  IgnoreBW: () => Prefs.obj.IgnoreBW !== undefined ? Prefs.obj.IgnoreBW : true,
  RitoBinPath: () => Prefs.obj.RitoBinPath || '',
  save: () => savePrefs(Prefs.obj)
};

// Message creation utility
const CreateMessage = (options, callback) => {
  // console.log('Message:', options); // Disabled to prevent spam
  // Defer callbacks to avoid re-entrancy/recursion loops
  if (typeof callback === 'function') {
    setTimeout(() => {
      try { callback(); } catch (e) { console.warn('CreateMessage callback error:', e); }
    }, 0);
  }
};

// Sleep utility
const Sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  Prefs,
  CreateMessage,
  Sleep
}; 