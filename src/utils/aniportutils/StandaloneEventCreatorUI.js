// Standalone Event Creator UI Component

import React, { useState } from 'react';
import { Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { 
  createParticleEvent, 
  createSubmeshEvent, 
  createSoundEvent,
  createFaceTargetEvent,
  addStandaloneEventToDonor 
} from './StandaloneEventCreator.js';

const StandaloneEventCreatorUI = ({ donorData, setDonorData, CreateMessage }) => {
  const [newEventType, setNewEventType] = useState('particle');
  const [newEventName, setNewEventName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Particle event specific options
  const [particleOptions, setParticleOptions] = useState({
    effectKey: '',
    startFrame: 0,
    endFrame: 0,
    boneName: '',
    isLoop: false
  });

  // Submesh event specific options
  const [submeshOptions, setSubmeshOptions] = useState({
    startFrame: 0,
    endFrame: 0,
    showSubmeshList: [],
    hideSubmeshList: []
  });

  // Sound event specific options
  const [soundOptions, setSoundOptions] = useState({
    soundName: '',
    startFrame: 0,
    isSelfOnly: true,
    isLoop: false
  });

  // FaceTarget event specific options
  const [faceTargetOptions, setFaceTargetOptions] = useState({
    startFrame: 0,
    endFrame: 0,
    faceTarget: 0,
    yRotationDegrees: 0.0,
    blendInTime: 0.0,
    blendOutTime: 0.0
  });

  // Track which FaceTarget fields have been explicitly set by user
  const [faceTargetTouched, setFaceTargetTouched] = useState({
    startFrame: false,
    endFrame: false,
    faceTarget: false,
    yRotationDegrees: false,
    blendInTime: false,
    blendOutTime: false
  });

  const handleCreateStandaloneEvent = async () => {
    if (!newEventName.trim()) {
      CreateMessage({
        title: 'Invalid Input',
        message: 'Please enter an event name',
        type: 'error'
      });
      return;
    }

    setIsCreating(true);

    try {
      let event;
      
      switch (newEventType) {
        case 'particle':
          event = createParticleEvent(newEventName, {
            effectKey: particleOptions.effectKey || newEventName,
            startFrame: particleOptions.startFrame,
            endFrame: particleOptions.endFrame,
            boneName: particleOptions.boneName || null,
            isLoop: particleOptions.isLoop
          });
          break;
          
        case 'submesh':
          event = createSubmeshEvent(newEventName, {
            startFrame: submeshOptions.startFrame,
            endFrame: submeshOptions.endFrame,
            showSubmeshList: submeshOptions.showSubmeshList,
            hideSubmeshList: submeshOptions.hideSubmeshList
          });
          break;
          
        case 'sound':
          event = createSoundEvent(newEventName, {
            soundName: soundOptions.soundName || newEventName,
            startFrame: soundOptions.startFrame,
            isSelfOnly: soundOptions.isSelfOnly,
            isLoop: soundOptions.isLoop
          });
          break;
          
        case 'facetarget':
          event = createFaceTargetEvent(newEventName, {
            startFrame: faceTargetOptions.startFrame,
            endFrame: faceTargetOptions.endFrame,
            faceTarget: faceTargetOptions.faceTarget,
            yRotationDegrees: faceTargetOptions.yRotationDegrees,
            blendInTime: faceTargetOptions.blendInTime,
            blendOutTime: faceTargetOptions.blendOutTime
          }, faceTargetTouched);
          break;
          
        default:
          throw new Error(`Unknown event type: ${newEventType}`);
      }

      // Add to donor data
      const updatedDonorData = addStandaloneEventToDonor(donorData, event);
      setDonorData(updatedDonorData);

      // Reset form
      setNewEventName('');
      setParticleOptions({ effectKey: '', startFrame: 0, endFrame: 0, boneName: '', isLoop: false });
      setSubmeshOptions({ startFrame: 0, endFrame: 0, showSubmeshList: [], hideSubmeshList: [] });
      setSoundOptions({ soundName: '', startFrame: 0, isSelfOnly: true, isLoop: false });

      CreateMessage({
        title: 'Event Created',
        message: `Created standalone ${newEventType} event "${newEventName}"`,
        type: 'success'
      });

    } catch (error) {
      console.error('Error creating standalone event:', error);
      CreateMessage({
        title: 'Creation Failed',
        message: `Failed to create event: ${error.message}`,
        type: 'error'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const renderEventTypeOptions = () => {
    switch (newEventType) {
      case 'particle':
        return (
          <div className="event-options">
            <div className="option-row">
              <label>Effect Key:</label>
              <input
                type="text"
                value={particleOptions.effectKey}
                onChange={(e) => setParticleOptions(prev => ({ ...prev, effectKey: e.target.value }))}
                placeholder="VFX effect name"
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Start Frame:</label>
              <input
                type="number"
                value={particleOptions.startFrame}
                onChange={(e) => setParticleOptions(prev => ({ ...prev, startFrame: parseInt(e.target.value) || 0 }))}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>End Frame (optional):</label>
              <input
                type="number"
                value={particleOptions.endFrame}
                onChange={(e) => setParticleOptions(prev => ({ ...prev, endFrame: parseInt(e.target.value) || 0 }))}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Bone Name (optional):</label>
              <input
                type="text"
                value={particleOptions.boneName}
                onChange={(e) => setParticleOptions(prev => ({ ...prev, boneName: e.target.value }))}
                placeholder="Bone attachment point"
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>
                <input
                  type="checkbox"
                  checked={particleOptions.isLoop}
                  onChange={(e) => setParticleOptions(prev => ({ ...prev, isLoop: e.target.checked }))}
                />
                Loop Effect
              </label>
            </div>
          </div>
        );

      case 'submesh':
        return (
          <div className="event-options">
            <div className="option-row">
              <label>Start Frame:</label>
              <input
                type="number"
                value={submeshOptions.startFrame}
                onChange={(e) => setSubmeshOptions(prev => ({ ...prev, startFrame: parseInt(e.target.value) || 0 }))}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>End Frame:</label>
              <input
                type="number"
                value={submeshOptions.endFrame}
                onChange={(e) => setSubmeshOptions(prev => ({ ...prev, endFrame: parseInt(e.target.value) || 30 }))}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Show Submeshes (comma-separated):</label>
              <input
                type="text"
                value={submeshOptions.showSubmeshList.join(', ')}
                onChange={(e) => setSubmeshOptions(prev => ({ 
                  ...prev, 
                  showSubmeshList: e.target.value.split(',').map(s => s.trim()).filter(s => s) 
                }))}
                placeholder="Weapon, Shield, etc."
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Hide Submeshes (comma-separated):</label>
              <input
                type="text"
                value={submeshOptions.hideSubmeshList.join(', ')}
                onChange={(e) => setSubmeshOptions(prev => ({ 
                  ...prev, 
                  hideSubmeshList: e.target.value.split(',').map(s => s.trim()).filter(s => s) 
                }))}
                placeholder="Weapon, Shield, etc."
                className="option-input"
              />
            </div>
          </div>
        );

      case 'sound':
        return (
          <div className="event-options">
            <div className="option-row">
              <label>Sound Name:</label>
              <input
                type="text"
                value={soundOptions.soundName}
                onChange={(e) => setSoundOptions(prev => ({ ...prev, soundName: e.target.value }))}
                placeholder="Sound file name"
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Start Frame:</label>
              <input
                type="number"
                value={soundOptions.startFrame}
                onChange={(e) => setSoundOptions(prev => ({ ...prev, startFrame: parseInt(e.target.value) || 0 }))}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>
                <input
                  type="checkbox"
                  checked={soundOptions.isSelfOnly}
                  onChange={(e) => setSoundOptions(prev => ({ ...prev, isSelfOnly: e.target.checked }))}
                />
                Self Only
              </label>
            </div>
            <div className="option-row">
              <label>
                <input
                  type="checkbox"
                  checked={soundOptions.isLoop}
                  onChange={(e) => setSoundOptions(prev => ({ ...prev, isLoop: e.target.checked }))}
                />
                Loop Sound
              </label>
            </div>
          </div>
        );

      case 'facetarget':
        return (
          <div className="event-options">
            <div className="option-row">
              <label>Start Frame:</label>
              <input
                type="number"
                value={faceTargetOptions.startFrame}
                onChange={(e) => {
                  setFaceTargetOptions(prev => ({ ...prev, startFrame: parseInt(e.target.value) || 0 }));
                  setFaceTargetTouched(prev => ({ ...prev, startFrame: true }));
                }}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>End Frame (optional):</label>
              <input
                type="number"
                value={faceTargetOptions.endFrame}
                onChange={(e) => {
                  setFaceTargetOptions(prev => ({ ...prev, endFrame: parseInt(e.target.value) || 0 }));
                  setFaceTargetTouched(prev => ({ ...prev, endFrame: true }));
                }}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Face Target (0-255):</label>
              <input
                type="number"
                min="0"
                max="255"
                value={faceTargetOptions.faceTarget}
                onChange={(e) => {
                  setFaceTargetOptions(prev => ({ ...prev, faceTarget: parseInt(e.target.value) || 0 }));
                  setFaceTargetTouched(prev => ({ ...prev, faceTarget: true }));
                }}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Y Rotation Degrees:</label>
              <input
                type="number"
                step="0.1"
                value={faceTargetOptions.yRotationDegrees}
                onChange={(e) => {
                  setFaceTargetOptions(prev => ({ ...prev, yRotationDegrees: parseFloat(e.target.value) || 0.0 }));
                  setFaceTargetTouched(prev => ({ ...prev, yRotationDegrees: true }));
                }}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Blend In Time:</label>
              <input
                type="number"
                step="0.1"
                value={faceTargetOptions.blendInTime}
                onChange={(e) => {
                  setFaceTargetOptions(prev => ({ ...prev, blendInTime: parseFloat(e.target.value) || 0.0 }));
                  setFaceTargetTouched(prev => ({ ...prev, blendInTime: true }));
                }}
                className="option-input"
              />
            </div>
            <div className="option-row">
              <label>Blend Out Time:</label>
              <input
                type="number"
                step="0.1"
                value={faceTargetOptions.blendOutTime}
                onChange={(e) => {
                  setFaceTargetOptions(prev => ({ ...prev, blendOutTime: parseFloat(e.target.value) || 0.0 }));
                  setFaceTargetTouched(prev => ({ ...prev, blendOutTime: true }));
                }}
                className="option-input"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="standalone-event-creator">
      <h4>Create Standalone Events</h4>
      <p className="creator-description">
        Create reusable events that can be dragged to multiple target clips
      </p>
      
      <div className="create-event-form">
        <div className="form-row">
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel sx={{ color: 'var(--text)', '&.Mui-focused': { color: 'var(--accent)' } }}>
              Event Type
            </InputLabel>
            <Select
              value={newEventType}
              onChange={(e) => setNewEventType(e.target.value)}
              sx={{
                color: 'var(--text)',
                backgroundColor: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--glass-border)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--accent)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--accent)',
                },
                '& .MuiSelect-icon': {
                  color: 'var(--text)',
                }
              }}
            >
              <MenuItem value="particle">ParticleEventData</MenuItem>
              <MenuItem value="submesh">SubmeshVisibilityEventData</MenuItem>
              <MenuItem value="sound">SoundEventData</MenuItem>
              <MenuItem value="facetarget">FaceTargetEventData</MenuItem>
            </Select>
          </FormControl>
          
          <input
            type="text"
            placeholder="Event name (e.g., MyVFX, HideWeapon)"
            value={newEventName}
            onChange={(e) => setNewEventName(e.target.value)}
            className="event-name-input"
          />
          
          <button 
            className="create-event-btn"
            onClick={handleCreateStandaloneEvent}
            disabled={!newEventName.trim() || isCreating}
          >
            {isCreating ? 'Creating...' : '+ Create Event'}
          </button>
        </div>
        
        {renderEventTypeOptions()}
      </div>
    </div>
  );
};

export default StandaloneEventCreatorUI;
