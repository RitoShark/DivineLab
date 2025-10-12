import React, { useState, useEffect, useRef } from 'react';
import './MaskViewer.css';

const MaskViewer = ({ 
  targetAnimationFile, 
  targetSkinsFile, 
  targetData,
  onDataChange,
  onStatusUpdate,
  onMaskDataChange,
  skeletonPath  // Add skeleton path prop
}) => {
  // Get the file path from the target animation file
  const binPath = targetAnimationFile;
  // State management
  const [sklData, setSklData] = useState(null);
  const [maskData, setMaskData] = useState(null);
  const [trackData, setTrackData] = useState(null);
  const [selectedMask, setSelectedMask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);
  const [jointWeights, setJointWeights] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Multi-selection state
  const [selectedJoints, setSelectedJoints] = useState(new Set());
  const [lastSelectedJoint, setLastSelectedJoint] = useState(null);
  const [focusedInput, setFocusedInput] = useState(null); // Track which input is focused
  const [singleSelectionMode, setSingleSelectionMode] = useState(false); // Toggle between single and multi-selection
  
  // Mask-specific selection state
  const [selectedMasks, setSelectedMasks] = useState(new Set()); // Track which masks are selected for editing
  const [maskEditMode, setMaskEditMode] = useState(false); // Toggle mask selection mode
  
  // Create mask dialog state
  const [showCreateMaskDialog, setShowCreateMaskDialog] = useState(false);
  const [newMaskName, setNewMaskName] = useState('');
  const [trackPriority, setTrackPriority] = useState(1);
  const [trackBlendMode, setTrackBlendMode] = useState(0);
  const [trackBlendWeight, setTrackBlendWeight] = useState(1.0);
  const [createWithTrackData, setCreateWithTrackData] = useState(true);
  const [showPriority, setShowPriority] = useState(false);
  const [showBlendMode, setShowBlendMode] = useState(false);
  const [showBlendWeight, setShowBlendWeight] = useState(false);
  
  // TrackData editing state
  const [editingTrack, setEditingTrack] = useState(null);
  const [editingValues, setEditingValues] = useState({});
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Refs
  const tableRef = useRef(null);

  // Keyboard event handling
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        clearSelection();
      } else if (event.ctrlKey && event.key === 'a') {
        event.preventDefault();
        selectAllJoints();
      } else if (event.key === 'Enter' && selectedJoints.size > 0) {
        // Focus the first selected joint's input in the first mask column
        event.preventDefault();
        if (maskData?.mask_names?.[0]) {
          const jointIds = sklData?.joints?.map(joint => joint.id) || [];
          const firstSelectedJoint = jointIds.find(id => selectedJoints.has(id));
          if (firstSelectedJoint) {
            // Escape the mask name for CSS selector (handle hex values like 0xcd33fc7e)
            const escapedMaskName = CSS.escape ? CSS.escape(maskData.mask_names[0]) : maskData.mask_names[0].replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
            const firstInput = document.querySelector(`input[data-joint="${firstSelectedJoint}"][data-mask="${escapedMaskName}"]`);
            if (firstInput) {
              firstInput.focus();
              firstInput.select();
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sklData, selectedJoints, maskData]);

  // Auto-load data when target files change
  useEffect(() => {
    if (targetAnimationFile && targetSkinsFile) {
      loadMaskData();
    }
  }, [targetAnimationFile, targetSkinsFile]);


  // Load mask data from backend
  const loadMaskData = async () => {
    if (!targetAnimationFile) return;

    setIsLoading(true);
    setLoadingMessage('Loading mask data...');
    setError(null);

    try {
      // Step 0: Test if backend is working
      setLoadingMessage('Testing backend connection...');
      const testResponse = await fetch('http://127.0.0.1:5001/api/mask-viewer/test');
      const testResult = await testResponse.json();

      // Step 1: Auto-detect SKL file
      setLoadingMessage('Auto-detecting SKL file...');
      
      // Prepare request data - send both skeleton path and BIN path for context-based detection
      // Try to get skeleton path from props or from targetData
      const actualSkeletonPath = skeletonPath || targetData?.skeletonInfo?.skeleton;
      const requestData = {
        bin_path: targetAnimationFile,  // Always send the BIN file path for context
        ...(actualSkeletonPath && { skl_path: actualSkeletonPath })  // Include skeleton path if available
      };
      
      
      const sklResponse = await fetch('http://127.0.0.1:5001/api/mask-viewer/auto-detect-skl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const sklResult = await sklResponse.json();
      
      if (!sklResult.success) {
        throw new Error(`SKL auto-detection failed: ${sklResult.error}`);
      }

      // Step 2: Load SKL file
      setLoadingMessage('Loading skeleton data...');
      
      const sklLoadResponse = await fetch('http://127.0.0.1:5001/api/mask-viewer/load-skl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skl_path: sklResult.skl_path })
      });

      const sklLoadResult = await sklLoadResponse.json();
      
      if (!sklLoadResult.success) {
        throw new Error(`SKL loading failed: ${sklLoadResult.error}`);
      }

      setSklData(sklLoadResult);

      // Step 3: Load mask data from BIN
      setLoadingMessage('Loading mask data...');
      const maskResponse = await fetch('http://127.0.0.1:5001/api/mask-viewer/load-mask-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bin_path: targetAnimationFile })
      });

      const maskResult = await maskResponse.json();
      
      if (!maskResult.success) {
        throw new Error(`Mask data loading failed: ${maskResult.error}`);
      }

      setMaskData(maskResult);
      
      // Only update trackData if we don't have any local changes
      if (!editingTrack) {
        setTrackData(maskResult.track_data || {});
        // Debug: Log track data
        console.log('TrackData received:', maskResult.track_data);
        console.log('Track names:', Object.keys(maskResult.track_data || {}));
      }
      
      // Save mask data to parent state
      if (onMaskDataChange) {
        onMaskDataChange(maskResult.mask_data);
      }
      
      // Select first mask if available
      if (maskResult.mask_names && maskResult.mask_names.length > 0) {
        setSelectedMask(maskResult.mask_names[0]);
        loadMaskWeights(maskResult.mask_data, sklLoadResult);
      }

      const trackCount = maskResult.total_tracks || 0;
      onStatusUpdate(`Mask data loaded: ${maskResult.total_masks} masks, ${trackCount} tracks, ${sklLoadResult.total_joints} joints`);

    } catch (error) {
      console.error('Failed to load mask data:', error);
      
      // Check if it's a network error
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        setError('Cannot connect to backend server. Please make sure the Flask server is running on port 5001.');
      } else {
        setError(error.message);
      }
      
      onStatusUpdate(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Load weights for a specific mask
  const loadMaskWeights = (maskData, sklDataParam = null) => {
    if (!maskData) return;

    const currentSklData = sklDataParam || sklData;

    const jointWeightsMap = {};

    if (currentSklData && currentSklData.joints) {
      currentSklData.joints.forEach((joint, index) => {
        jointWeightsMap[joint.id] = {
          joint: joint
        };
        
        // Load weights for all masks using array index (not joint.id)
        Object.keys(maskData).forEach(maskName => {
          const weights = maskData[maskName];
          // Use array index, not joint.id, since mask data is indexed by position
          jointWeightsMap[joint.id][maskName] = weights[index] || 0;
        });
      });
    }

    setJointWeights(jointWeightsMap);
  };

  // Handle mask selection change (no longer needed since we show all masks)
  const handleMaskChange = (maskName) => {
    setSelectedMask(maskName);
  };

  // Handle weight change
  const handleWeightChange = (jointId, newWeight, maskName) => {
    const clampedWeight = Math.max(0, Math.min(1, parseFloat(newWeight) || 0));
    
    setJointWeights(prev => {
      const newWeights = { ...prev };
      
      // Determine which joints and masks to update
      let jointsToUpdate = [jointId];
      let masksToUpdate = [maskName];
      
      // If multiple joints are selected, apply to all selected joints
      if (selectedJoints.size > 1 && selectedJoints.has(jointId)) {
        jointsToUpdate = Array.from(selectedJoints);
      }
      
      // If mask edit mode is on and masks are selected, apply to selected masks
      if (maskEditMode && selectedMasks.size > 0) {
        masksToUpdate = Array.from(selectedMasks);
      }
      
      // Apply changes to all combinations of selected joints and masks
      jointsToUpdate.forEach(selectedJointId => {
        masksToUpdate.forEach(selectedMaskName => {
          newWeights[selectedJointId] = {
            ...newWeights[selectedJointId],
            [selectedMaskName]: clampedWeight
          };
        });
      });
      
      return newWeights;
    });

    setHasUnsavedChanges(true);
    
    // Update parent state with modified mask data
    if (onMaskDataChange && maskData) {
      const updatedMaskData = { ...maskData.mask_data };
      
      // Determine which joints and masks to update
      let jointsToUpdate = [jointId];
      let masksToUpdate = [maskName];
      
      // If multiple joints are selected, apply to all selected joints
      if (selectedJoints.size > 1 && selectedJoints.has(jointId)) {
        jointsToUpdate = Array.from(selectedJoints);
      }
      
      // If mask edit mode is on and masks are selected, apply to selected masks
      if (maskEditMode && selectedMasks.size > 0) {
        masksToUpdate = Array.from(selectedMasks);
      }
      
      // Apply changes to all combinations of selected joints and masks
      jointsToUpdate.forEach(selectedJointId => {
        masksToUpdate.forEach(selectedMaskName => {
          if (updatedMaskData[selectedMaskName]) {
            updatedMaskData[selectedMaskName][selectedJointId] = clampedWeight;
          }
        });
      });
      
      onMaskDataChange(updatedMaskData);
    }
  };

  // Handle joint row selection
  const handleJointClick = (jointId, event) => {
    // In single selection mode, always select only one joint
    if (singleSelectionMode) {
      setSelectedJoints(new Set([jointId]));
      setLastSelectedJoint(jointId);
      return;
    }

    // Multi-selection mode - only allow selection with Shift+Click or Ctrl+Click
    if (!event.shiftKey && !(event.ctrlKey || event.metaKey)) {
      return; // Do nothing for regular left click - don't prevent default behavior
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    // Prevent text selection
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
    
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+Click: Toggle selection
      setSelectedJoints(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(jointId)) {
          newSelection.delete(jointId);
        } else {
          newSelection.add(jointId);
        }
        return newSelection;
      });
      setLastSelectedJoint(jointId);
    } else if (event.shiftKey && lastSelectedJoint !== null) {
      // Shift+Click: Range selection
      const jointIds = sklData?.joints?.map(joint => joint.id) || [];
      const startIndex = jointIds.indexOf(lastSelectedJoint);
      const endIndex = jointIds.indexOf(jointId);
      
      if (startIndex !== -1 && endIndex !== -1) {
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        const rangeSelection = new Set();
        
        for (let i = start; i <= end; i++) {
          rangeSelection.add(jointIds[i]);
        }
        
        setSelectedJoints(rangeSelection);
      }
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedJoints(new Set());
    setLastSelectedJoint(null);
  };

  // Select all joints
  const selectAllJoints = () => {
    if (sklData?.joints) {
      const allJointIds = new Set(sklData.joints.map(joint => joint.id));
      setSelectedJoints(allJointIds);
    }
  };

  // Handle mask selection
  const handleMaskSelection = (maskName, event) => {
    if (!maskEditMode) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    setSelectedMasks(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(maskName)) {
        newSelection.delete(maskName);
      } else {
        newSelection.add(maskName);
      }
      return newSelection;
    });
  };

  // Clear mask selection
  const clearMaskSelection = () => {
    setSelectedMasks(new Set());
  };

  // Toggle mask edit mode
  const toggleMaskEditMode = () => {
    setMaskEditMode(prev => !prev);
    if (maskEditMode) {
      clearMaskSelection();
    }
  };

  // Handle input focus - when multiple joints are selected, focus the first one
  const handleInputFocus = (jointId, maskName, event) => {
    if (selectedJoints.size > 1 && selectedJoints.has(jointId)) {
      // Find the first selected joint in the list
      const jointIds = sklData?.joints?.map(joint => joint.id) || [];
      const firstSelectedJoint = jointIds.find(id => selectedJoints.has(id));
      
      if (firstSelectedJoint && firstSelectedJoint !== jointId) {
        // Prevent the current input from focusing
        event.preventDefault();
        event.target.blur();
        
        // Focus the first selected joint's input instead
        setTimeout(() => {
          // Escape the mask name for CSS selector (handle hex values like 0xcd33fc7e)
          const escapedMaskName = CSS.escape ? CSS.escape(maskName) : maskName.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
          const firstInput = document.querySelector(`input[data-joint="${firstSelectedJoint}"][data-mask="${escapedMaskName}"]`);
          if (firstInput) {
            firstInput.focus();
            firstInput.select(); // Select all text for easy replacement
            setFocusedInput(`${firstSelectedJoint}-${maskName}`);
          }
        }, 10);
        return;
      }
    }
    
    setFocusedInput(`${jointId}-${maskName}`);
  };

  // Handle input blur
  const handleInputBlur = () => {
    setFocusedInput(null);
  };


  // TrackData editing functions
  const startEditingTrack = (trackName, currentProps) => {
    setEditingTrack(trackName);
    setEditingValues({
      mPriority: currentProps.mPriority !== undefined ? currentProps.mPriority : '',
      mBlendMode: currentProps.mBlendMode !== undefined ? currentProps.mBlendMode : '',
      mBlendWeight: currentProps.mBlendWeight !== undefined ? currentProps.mBlendWeight : ''
    });
  };

  const cancelEditingTrack = () => {
    setEditingTrack(null);
    setEditingValues({});
  };

  const saveTrackData = (trackName) => {
    console.log(`Saving track data for ${trackName}:`, editingValues);
    
    // Update trackData state directly - no backend needed!
    const updatedTrackData = { ...trackData };
    
    // Create new properties object
    const newProps = {};
    if (editingValues.mPriority !== '' && editingValues.mPriority !== null) {
      newProps.mPriority = parseInt(editingValues.mPriority);
    }
    if (editingValues.mBlendMode !== '' && editingValues.mBlendMode !== null) {
      newProps.mBlendMode = parseInt(editingValues.mBlendMode);
    }
    if (editingValues.mBlendWeight !== '' && editingValues.mBlendWeight !== null) {
      newProps.mBlendWeight = parseFloat(editingValues.mBlendWeight);
    }
    
    // Update the track data
    updatedTrackData[trackName] = newProps;
    setTrackData(updatedTrackData);
    
    // Notify parent component about TrackData changes
    if (onDataChange) {
      onDataChange({
        ...targetData,
        trackData: updatedTrackData
      });
    }
    
    // Exit editing mode
    setEditingTrack(null);
    setEditingValues({});
    
    console.log(`Successfully updated track data for ${trackName}:`, newProps);
    console.log('Updated trackData:', updatedTrackData);
  };

  // Create new mask
  const createNewMask = async () => {
    if (!newMaskName.trim()) {
      alert('Please enter a mask name');
      return;
    }
    
    if (!targetAnimationFile || !sklData) {
      alert('No animation file or skeleton data loaded');
      return;
    }
    
    setIsLoading(true);
    setLoadingMessage(createWithTrackData ? 'Creating mask with TrackData...' : 'Creating new mask...');
    
    try {
      let response;
      
      if (createWithTrackData) {
        // Use the new combined endpoint
        // Only send properties that the user explicitly added
        const requestData = {
          bin_path: targetAnimationFile,
          mask_name: newMaskName.trim(),
          bone_count: sklData.total_joints || 0
        };
        
        if (showPriority) {
          requestData.track_priority = trackPriority;
        }
        if (showBlendMode) {
          requestData.track_blend_mode = trackBlendMode;
        }
        if (showBlendWeight) {
          requestData.track_blend_weight = trackBlendWeight;
        }
        
        response = await fetch('http://127.0.0.1:5001/api/mask-viewer/create-mask-with-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData)
        });
      } else {
        // Use the original mask-only endpoint
        response = await fetch('http://127.0.0.1:5001/api/mask-viewer/create-mask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bin_path: targetAnimationFile,
            mask_name: newMaskName.trim(),
            bone_count: sklData.total_joints || 0
          })
        });
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Reload mask data to include the new mask and track data
        await loadMaskData();
        setShowCreateMaskDialog(false);
        setNewMaskName('');
        setTrackPriority(1);
        setTrackBlendMode(0);
        setTrackBlendWeight(1.0);
        setCreateWithTrackData(true);
        setShowPriority(false);
        setShowBlendMode(false);
        setShowBlendWeight(false);
        
        const message = createWithTrackData 
          ? `Created mask "${newMaskName}" with TrackData`
          : `Created new mask: ${newMaskName}`;
        onStatusUpdate(message);
      } else {
        alert(`Failed to create mask: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating mask:', error);
      alert(`Error creating mask: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Save mask data
  const saveMaskData = async () => {
    if (!maskData || !targetAnimationFile) return;

    console.log('DEBUG SAVE: Starting save process');
    console.log('DEBUG SAVE: maskData:', maskData);
    console.log('DEBUG SAVE: targetAnimationFile:', targetAnimationFile);
    console.log('DEBUG SAVE: jointWeights:', jointWeights);

    setIsLoading(true);
    setLoadingMessage('Saving mask data...');

    try {
      // Prepare updated mask data for all masks
      const updatedMaskData = { ...maskData.mask_data };
      console.log('DEBUG SAVE: Initial updatedMaskData:', updatedMaskData);

      // Convert joint weights back to array format for each mask
      if (sklData && sklData.joints) {
        maskData.mask_names.forEach(maskName => {
          const weights = [];
          sklData.joints.forEach((joint, index) => {
            const weightValue = jointWeights[joint.id]?.[maskName] || 0;
            weights[index] = weightValue;
            if (index < 5) { // Log first 5 weights for debugging
              console.log(`DEBUG SAVE: Mask ${maskName}, Joint ${joint.id} (index ${index}), weight: ${weightValue}`);
            }
          });
          updatedMaskData[maskName] = weights;
          console.log(`DEBUG SAVE: Updated weights for ${maskName}:`, weights.slice(0, 10)); // Log first 10 weights
        });
      }

      // Send to backend
      console.log('DEBUG SAVE: Sending to backend:', {
        bin_path: targetAnimationFile,
        mask_data: updatedMaskData,
        output_path: targetAnimationFile
      });
      
      const response = await fetch('http://127.0.0.1:5001/api/mask-viewer/save-mask-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bin_path: targetAnimationFile,
          mask_data: updatedMaskData,
          output_path: targetAnimationFile
        })
      });

      console.log('DEBUG SAVE: Response status:', response.status);
      const result = await response.json();
      console.log('DEBUG SAVE: Backend result:', result);
      
      if (!result.success) {
        throw new Error(`Save failed: ${result.error}`);
      }

      setHasUnsavedChanges(false);
      onStatusUpdate(`Mask data saved successfully`);
      
      // Update the mask data state
      setMaskData(prev => ({
        ...prev,
        mask_data: updatedMaskData
      }));

    } catch (error) {
      console.error('Failed to save mask data:', error);
      setError(error.message);
      onStatusUpdate(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Clear all data
  const clearData = () => {
    setSklData(null);
    setMaskData(null);
    setSelectedMask(null);
    setJointWeights({});
    setHasUnsavedChanges(false);
    setError(null);
    onStatusUpdate('Mask data cleared');
  };

  // Delete mask function (frontend-only)
  const deleteMask = (maskName) => {
    if (!maskData || !targetAnimationFile) return;
    
    try {
      console.log(`🗑️ Deleting mask: ${maskName}`);
      
      // Remove mask from local state
      const updatedMaskData = { ...maskData };
      if (updatedMaskData.mask_names) {
        updatedMaskData.mask_names = updatedMaskData.mask_names.filter(name => name !== maskName);
      }
      if (updatedMaskData.mask_weights) {
        delete updatedMaskData.mask_weights[maskName];
      }
      
      // Update local state
      setMaskData(updatedMaskData);
      
      // Clear joint weights for this mask
      const updatedJointWeights = { ...jointWeights };
      Object.keys(updatedJointWeights).forEach(jointId => {
        if (updatedJointWeights[jointId][maskName] !== undefined) {
          delete updatedJointWeights[jointId][maskName];
        }
      });
      setJointWeights(updatedJointWeights);
      
      // Notify parent component about the deletion
      if (onDataChange) {
        onDataChange({
          ...targetData,
          maskData: updatedMaskData,
          deletedMask: maskName // Signal that a mask was deleted
        });
      }
      
      console.log(`✅ Mask "${maskName}" deleted successfully`);
      
    } catch (error) {
      console.error('Error deleting mask:', error);
      alert(`Failed to delete mask: ${error.message}`);
    }
  };

  // Delete track data function (frontend-only)
  const deleteTrackData = (trackName) => {
    if (!trackData || !targetAnimationFile) return;
    
    try {
      console.log(`🗑️ Deleting track: ${trackName}`);
      
      // Remove track from local state
      const updatedTrackData = { ...trackData };
      delete updatedTrackData[trackName];
      
      // Update local state
      setTrackData(updatedTrackData);
      
      // Notify parent component about the deletion
      if (onDataChange) {
        onDataChange({
          ...targetData,
          trackData: updatedTrackData,
          deletedTrack: trackName // Signal that a track was deleted
        });
      }
      
      console.log(`✅ Track "${trackName}" deleted successfully`);
      
    } catch (error) {
      console.error('Error deleting track data:', error);
      alert(`Failed to delete track data: ${error.message}`);
    }
  };

  // Show delete confirmation
  const showDeleteConfirmation = (type, name) => {
    setDeleteTarget({ type, name });
    setShowDeleteConfirm(true);
  };

  // Confirm delete
  const confirmDelete = () => {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'mask') {
      deleteMask(deleteTarget.name);
    } else if (deleteTarget.type === 'track') {
      deleteTrackData(deleteTarget.name);
    }
    
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  // Cancel delete
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="mask-viewer">
        <div className="mask-viewer-header">
          <h3>🎬 Mask Viewer</h3>
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>{loadingMessage}</span>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="mask-viewer">
        <div className="mask-viewer-header">
          <h3>🎬 Mask Viewer</h3>
          <button onClick={loadMaskData} className="btn-primary">
            🔄 Retry
          </button>
        </div>
        <div className="error-message">
          <p>❌ {error}</p>
        </div>
      </div>
    );
  }

  // Render no data state
  if (!maskData || !sklData) {
    return (
      <div className="mask-viewer">
        <div className="mask-viewer-header">
          <h3>🎬 Mask Viewer</h3>
          <button onClick={loadMaskData} className="btn-primary">
            📂 Load Mask Data
          </button>
        </div>
        <div className="no-data-message">
          <p>No mask data loaded. Click "Load Mask Data" to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mask-viewer">
      {/* Header */}
      <div className="mask-viewer-header">
        <div className="header-left">
          <h3>🎬 Mask Viewer</h3>
        </div>
        <div className="header-center">
          <div className="file-info-header">
            <div className="file-path">
              <strong>SKL:</strong> {sklData.skl_path}
            </div>
            <div className="file-path">
              <strong>BIN:</strong> {targetAnimationFile}
            </div>
            <div className="data-stats">
              📊 {maskData.total_masks || 0} masks, {trackData ? Object.keys(trackData).length : 0} tracks, {sklData.total_joints || 0} joints
            </div>
          </div>
        </div>
        <div className="header-controls">
          {selectedJoints.size > 0 && (
            <div className="selection-info">
              {selectedJoints.size} joint{selectedJoints.size !== 1 ? 's' : ''} selected
              <button onClick={clearSelection} className="btn-small">Clear</button>
            </div>
          )}
          {selectedMasks.size > 0 && (
            <div className="selection-info mask-selection-info">
              {selectedMasks.size} mask{selectedMasks.size !== 1 ? 's' : ''} selected
              <button onClick={clearMaskSelection} className="btn-small">Clear</button>
            </div>
          )}
          <button 
            onClick={toggleMaskEditMode}
            className={`btn-secondary ${maskEditMode ? 'active' : ''}`}
            title={maskEditMode ? 'Exit mask selection mode' : 'Enter mask selection mode'}
          >
            🎯 {maskEditMode ? 'Exit Mask Select' : 'Mask Select'}
          </button>
          <button 
            onClick={() => setShowCreateMaskDialog(true)} 
            className="btn-secondary"
            disabled={!sklData}
          >
            ➕ Create Mask
          </button>
          <button 
            onClick={saveMaskData} 
            className={`btn-primary ${hasUnsavedChanges ? 'btn-warning' : ''}`}
            disabled={!hasUnsavedChanges}
          >
            💾 Save {hasUnsavedChanges ? '*' : ''}
          </button>
          <button onClick={clearData} className="btn-secondary">
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mask-viewer-content">
        {/* Left Side - Mask Data Table */}
        <div className="mask-viewer-left">
          <div className="mask-table-container">
            <div className="mask-table" ref={tableRef}>
              {maskData && maskData.mask_names && maskData.mask_names.length > 0 && (
                <table className="mask-weights-table">
                  <thead>
                    <tr>
                      <th className="joint-header">Joint</th>
                      {maskData.mask_names.map(maskName => (
                        <th 
                          key={maskName} 
                          className={`weight-header ${maskEditMode ? 'mask-selectable' : ''} ${selectedMasks.has(maskName) ? 'mask-selected' : ''}`}
                          onClick={(e) => handleMaskSelection(maskName, e)}
                          style={{ cursor: maskEditMode ? 'pointer' : 'default' }}
                        >
                          <div className="mask-header-content">
                            <span>{maskName}</span>
                            {selectedMasks.has(maskName) && (
                              <span className="mask-selection-indicator">✓</span>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                showDeleteConfirmation('mask', maskName);
                              }}
                              className="btn-delete-mask"
                              title="Delete mask"
                            >
                              🗑️
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sklData.joints.map(joint => (
                      <tr 
                        key={joint.id} 
                        className={`joint-weight-row ${selectedJoints.has(joint.id) ? 'selected' : ''}`}
                      >
                        <td 
                          className="joint-info"
                          onClick={(e) => handleJointClick(joint.id, e)}
                          style={{ cursor: 'pointer' }}
                        >
                          <span className="joint-id">[{joint.id}]</span>
                          <span className="joint-name">{joint.name}</span>
                          {selectedJoints.has(joint.id) && (
                            <span className="selection-indicator">✓</span>
                          )}
                        </td>
                        {maskData.mask_names.map(maskName => {
                          const jointWeight = jointWeights[joint.id];
                          const weightValue = jointWeight?.[maskName] || 0;
                          
                          return (
                            <td 
                              key={maskName} 
                              className="weight-cell"
                            >
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.001"
                                value={weightValue}
                                onChange={(e) => handleWeightChange(joint.id, e.target.value, maskName)}
                                onFocus={(e) => handleInputFocus(joint.id, maskName, e)}
                                onBlur={handleInputBlur}
                                className="weight-input"
                                data-joint={joint.id}
                                data-mask={maskName}
                                style={{
                                  backgroundColor: selectedJoints.has(joint.id) && selectedJoints.size > 1 
                                    ? 'rgba(74, 144, 226, 0.1)' 
                                    : 'transparent'
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Side - Track Data Display */}
        <div className="mask-viewer-right">
          {trackData && Object.keys(trackData).length > 0 && (
            <div className="track-data-section">
              <h4>🎵 Track Data</h4>
              <div className="track-data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Track Name</th>
                      <th>Priority</th>
                      <th>Blend Mode</th>
                      <th>Blend Weight</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(trackData).map(([trackName, trackProps]) => {
                      const isEditing = editingTrack === trackName;
                      
                      return (
                        <tr key={trackName}>
                          <td>{trackName}</td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                value={editingValues.mPriority}
                                onChange={(e) => setEditingValues(prev => ({...prev, mPriority: e.target.value}))}
                                placeholder="Priority"
                                className="track-edit-input"
                              />
                            ) : (
                              <span 
                                onClick={() => startEditingTrack(trackName, trackProps)}
                                style={{ cursor: 'pointer' }}
                                title="Click to edit"
                              >
                                {trackProps.mPriority !== undefined ? trackProps.mPriority : 'N/A'}
                              </span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                value={editingValues.mBlendMode}
                                onChange={(e) => setEditingValues(prev => ({...prev, mBlendMode: e.target.value}))}
                                placeholder="Blend Mode"
                                className="track-edit-input"
                              />
                            ) : (
                              <span 
                                onClick={() => startEditingTrack(trackName, trackProps)}
                                style={{ cursor: 'pointer' }}
                                title="Click to edit"
                              >
                                {trackProps.mBlendMode !== undefined ? trackProps.mBlendMode : 'N/A'}
                              </span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.1"
                                value={editingValues.mBlendWeight}
                                onChange={(e) => setEditingValues(prev => ({...prev, mBlendWeight: e.target.value}))}
                                placeholder="Blend Weight"
                                className="track-edit-input"
                              />
                            ) : (
                              <span 
                                onClick={() => startEditingTrack(trackName, trackProps)}
                                style={{ cursor: 'pointer' }}
                                title="Click to edit"
                              >
                                {trackProps.mBlendWeight !== undefined ? trackProps.mBlendWeight : 'N/A'}
                              </span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <div className="track-edit-buttons">
                                <button 
                                  onClick={() => saveTrackData(trackName)}
                                  className="btn-save-track"
                                  title="Save changes"
                                >
                                  ✓
                                </button>
                                <button 
                                  onClick={cancelEditingTrack}
                                  className="btn-cancel-track"
                                  title="Cancel"
                                >
                                  ✗
                                </button>
                              </div>
                            ) : (
                              <div className="track-actions">
                                <button 
                                  onClick={() => startEditingTrack(trackName, trackProps)}
                                  className="btn-edit-track"
                                  title="Edit track"
                                >
                                  ✏️
                                </button>
                                <button 
                                  onClick={() => showDeleteConfirmation('track', trackName)}
                                  className="btn-delete-track"
                                  title="Delete track"
                                >
                                  🗑️
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Mask Dialog */}
      {showCreateMaskDialog && (
        <div className="modal-overlay">
          <div className="modal-dialog create-mask-dialog">
            <div className="modal-header">
              <h3>🎭 Create New Mask</h3>
              <button 
                onClick={() => setShowCreateMaskDialog(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="maskName">Mask Name:</label>
                <input
                  id="maskName"
                  type="text"
                  value={newMaskName}
                  onChange={(e) => setNewMaskName(e.target.value)}
                  placeholder="Enter mask name (e.g., LowerBody, Face, etc.)"
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={createWithTrackData}
                    onChange={(e) => setCreateWithTrackData(e.target.checked)}
                  />
                  <span className="checkmark"></span>
                  Create associated TrackData entry
                </label>
                <div className="form-help">
                  TrackData defines how the mask blends and its priority in the animation system
                </div>
              </div>

              {createWithTrackData && (
                <div className="track-data-options">
                  <h4>🎵 TrackData Properties</h4>
                  <div className="form-help" style={{marginBottom: '20px', fontStyle: 'normal'}}>
                    TrackData will be created with default values. Click + to add custom properties.
                  </div>
                  
                  <div className="track-property-buttons">
                    <div className="property-button-row">
                      <span className="property-label">Priority</span>
                      {!showPriority && (
                        <button 
                          type="button"
                          className="add-property-btn"
                          onClick={() => setShowPriority(true)}
                        >
                          +
                        </button>
                      )}
                      {showPriority && (
                        <div className="property-input-group">
                          <input
                            type="number"
                            min="0"
                            max="255"
                            value={trackPriority}
                            onChange={(e) => setTrackPriority(parseInt(e.target.value) || 1)}
                            className="property-input"
                          />
                          <button 
                            type="button"
                            className="remove-property-btn"
                            onClick={() => setShowPriority(false)}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="property-button-row">
                      <span className="property-label">BlendMode</span>
                      {!showBlendMode && (
                        <button 
                          type="button"
                          className="add-property-btn"
                          onClick={() => setShowBlendMode(true)}
                        >
                          +
                        </button>
                      )}
                      {showBlendMode && (
                        <div className="property-input-group">
                          <select
                            value={trackBlendMode}
                            onChange={(e) => setTrackBlendMode(parseInt(e.target.value))}
                            className="property-select"
                          >
                            <option value={0}>Normal</option>
                            <option value={1}>Additive</option>
                            <option value={2}>Override</option>
                            <option value={3}>Multiply</option>
                          </select>
                          <button 
                            type="button"
                            className="remove-property-btn"
                            onClick={() => setShowBlendMode(false)}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="property-button-row">
                      <span className="property-label">BlendWeight</span>
                      {!showBlendWeight && (
                        <button 
                          type="button"
                          className="add-property-btn"
                          onClick={() => setShowBlendWeight(true)}
                        >
                          +
                        </button>
                      )}
                      {showBlendWeight && (
                        <div className="property-input-group">
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={trackBlendWeight}
                            onChange={(e) => setTrackBlendWeight(parseFloat(e.target.value) || 1.0)}
                            className="property-input"
                          />
                          <button 
                            type="button"
                            className="remove-property-btn"
                            onClick={() => setShowBlendWeight(false)}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="form-info">
                <p>This will create a new mask with {sklData?.total_joints || 0} joints, all set to weight 0.0</p>
                {createWithTrackData && (
                  <p>
                    TrackData entry will be created with the same name as the mask.
                    {!showPriority && !showBlendMode && !showBlendWeight ? 
                      ' Using default values (minimal TrackData).' : 
                      ' Using custom values as specified above.'
                    }
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateMaskDialog(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={createNewMask}
                className="btn-primary"
                disabled={!newMaskName.trim() || isLoading}
              >
                {isLoading ? 'Creating...' : createWithTrackData ? 'Create Mask + TrackData' : 'Create Mask Only'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay">
          <div className="delete-confirm-dialog">
            <div className="delete-confirm-header">
              <h4>🗑️ Confirm Delete</h4>
            </div>
            <div className="delete-confirm-body">
              <p>
                Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              </p>
              <p className="delete-warning">
                This action cannot be undone!
              </p>
            </div>
            <div className="delete-confirm-footer">
              <button 
                onClick={cancelDelete}
                className="btn-cancel-delete"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="btn-confirm-delete"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaskViewer;
