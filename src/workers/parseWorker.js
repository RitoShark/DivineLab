// Web Worker for heavy parsing operations
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  try {
    switch (type) {
      case 'PARSE_PY_FILE':
        // Import parsePyFile function (you'll need to make it available)
        const systems = self.parsePyFile(data);
        self.postMessage({ type: 'PARSE_PY_FILE_SUCCESS', data: systems });
        break;
        
      case 'PARSE_STATIC_MATERIALS':
        const materials = self.parseStaticMaterials(data);
        self.postMessage({ type: 'PARSE_STATIC_MATERIALS_SUCCESS', data: materials });
        break;
        
      default:
        self.postMessage({ type: 'ERROR', error: 'Unknown message type' });
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};

// Note: You'll need to import the parsing functions here
// This is a placeholder - the actual implementation would require
// making the parsing functions available to the worker
