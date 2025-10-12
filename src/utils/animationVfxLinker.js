// Animation VFX Linker - Links animation events with VFX systems
// Handles the connection between ParticleEventData and VfxSystemDefinitionData

/**
 * Link animation events with VFX systems from skins file
 * @param {Object} animationData - Parsed animation data
 * @param {Object} vfxSystems - Parsed VFX systems from skins file
 * @param {Object} resourceResolver - Resource resolver mappings
 * @returns {Object} - Linked data structure
 */
const linkAnimationWithVfx = (animationData, vfxSystems, resourceResolver) => {
  const linkedData = {
    connections: {},
    missingConnections: [],
    orphanedVfx: [],
    statistics: {
      totalEvents: 0,
      linkedEvents: 0,
      missingVfx: 0
    }
  };

  console.log('Linking animation events with VFX systems...');

  // Process each animation clip
  Object.values(animationData.clips).forEach(clip => {
    clip.events.particle.forEach(particleEvent => {
      linkedData.statistics.totalEvents++;
      
      if (particleEvent.effectKey) {
        // Try to find the VFX system
        const vfxConnection = findVfxSystemForEffectKey(
          particleEvent.effectKey,
          vfxSystems,
          resourceResolver
        );

        if (vfxConnection) {
          // Create connection
          const connectionKey = `${clip.name}.${particleEvent.effectKey}`;
          linkedData.connections[connectionKey] = {
            animationClip: clip.name,
            particleEvent: particleEvent,
            vfxSystem: vfxConnection.vfxSystem,
            resourceResolverKey: vfxConnection.resourceKey,
            connectionType: vfxConnection.connectionType
          };
          linkedData.statistics.linkedEvents++;
        } else {
          // Missing connection
          linkedData.missingConnections.push({
            animationClip: clip.name,
            effectKey: particleEvent.effectKey,
            startFrame: particleEvent.startFrame,
            boneName: particleEvent.boneName
          });
          linkedData.statistics.missingVfx++;
        }
      }
    });
  });

  // Find orphaned VFX systems (not used by any animation)
  const usedVfxKeys = Object.values(linkedData.connections).map(conn => conn.vfxSystem.name);
  Object.keys(vfxSystems).forEach(vfxKey => {
    if (!usedVfxKeys.includes(vfxKey)) {
      linkedData.orphanedVfx.push(vfxKey);
    }
  });

  console.log(`Linking complete: ${linkedData.statistics.linkedEvents}/${linkedData.statistics.totalEvents} events linked`);
  
  return linkedData;
};

/**
 * Find VFX system for a given effect key
 * @param {string} effectKey - The effect key to search for
 * @param {Object} vfxSystems - Available VFX systems
 * @param {Object} resourceResolver - Resource resolver mappings
 * @returns {Object|null} - VFX connection or null
 */
const findVfxSystemForEffectKey = (effectKey, vfxSystems, resourceResolver) => {
  // Method 1: Direct match in VFX systems
  if (vfxSystems[effectKey]) {
    return {
      vfxSystem: vfxSystems[effectKey],
      resourceKey: effectKey,
      connectionType: 'direct'
    };
  }

  // Method 2: Search in ResourceResolver
  for (const [resourceKey, resourcePath] of Object.entries(resourceResolver)) {
    if (resourceKey === effectKey) {
      // Find VFX system that matches this resource path
      for (const [vfxKey, vfxSystem] of Object.entries(vfxSystems)) {
        if (resourcePath.includes(vfxKey) || vfxKey.includes(resourcePath.split('/').pop())) {
          return {
            vfxSystem: vfxSystem,
            resourceKey: resourceKey,
            connectionType: 'resource_resolver'
          };
        }
      }
    }
  }

  // Method 3: Fuzzy matching (partial name matches)
  const effectKeyLower = effectKey.toLowerCase();
  for (const [vfxKey, vfxSystem] of Object.entries(vfxSystems)) {
    if (vfxKey.toLowerCase().includes(effectKeyLower) || 
        effectKeyLower.includes(vfxKey.toLowerCase())) {
      return {
        vfxSystem: vfxSystem,
        resourceKey: vfxKey,
        connectionType: 'fuzzy'
      };
    }
  }

  return null;
};

/**
 * Port animation event with its linked VFX system
 * @param {Object} connection - Animation-VFX connection
 * @param {Object} targetAnimationData - Target animation data
 * @param {Object} targetVfxSystems - Target VFX systems
 * @param {Object} targetResourceResolver - Target resource resolver
 * @returns {Object} - Porting result
 */
const portAnimationEventWithVfx = (connection, targetAnimationData, targetVfxSystems, targetResourceResolver) => {
  console.log('🔧 LINKER: ===== PORT ANIMATION EVENT WITH VFX =====');
  console.log('🔧 LINKER: Connection object:', JSON.stringify(connection, null, 2));
  console.log('🔧 LINKER: Target animation data exists:', !!targetAnimationData);
  console.log('🔧 LINKER: Target VFX systems exists:', !!targetVfxSystems);
  console.log('🔧 LINKER: Target resource resolver exists:', !!targetResourceResolver);
  
  const result = {
    success: false,
    actions: [],
    warnings: [],
    errors: []
  };

  try {
    // 1. Check if target animation clip exists
    console.log('🔧 LINKER: Looking for target clip:', connection.animationClip);
    console.log('🔧 LINKER: Available target clips:', Object.keys(targetAnimationData.clips || {}));
    
    const targetClip = targetAnimationData.clips[connection.animationClip];
    if (!targetClip) {
      console.log('🔧 LINKER: Target clip not found!');
      result.errors.push(`Target animation clip "${connection.animationClip}" not found`);
      return result;
    }
    
    console.log('🔧 LINKER: Target clip found:', targetClip.name);

    // 2. Port the VFX system
    console.log('🔧 LINKER: Porting VFX system...');
    console.log('🔧 LINKER: VFX system object:', connection.vfxSystem);
    console.log('🔧 LINKER: Resource resolver key:', connection.resourceResolverKey);
    
    const vfxPortResult = portVfxSystem(
      connection.vfxSystem,
      targetVfxSystems,
      connection.resourceResolverKey
    );
    
    console.log('🔧 LINKER: VFX port result:', vfxPortResult);
    
    if (vfxPortResult.success) {
      result.actions.push('VFX system ported successfully');
      console.log('🔧 LINKER: VFX system ported successfully');
    } else {
      result.warnings.push('VFX system porting failed, but animation event will still be ported');
      console.log('🔧 LINKER: VFX system porting failed:', vfxPortResult.reason);
    }

    // 3. Port the animation event
    console.log('🔧 LINKER: Porting animation event...');
    console.log('🔧 LINKER: Particle event object:', connection.particleEvent);
    console.log('🔧 LINKER: Target clip:', targetClip.name);
    
    const eventPortResult = portAnimationEvent(
      connection.particleEvent,
      targetClip
    );

    console.log('🔧 LINKER: Event port result:', eventPortResult);

    if (eventPortResult.success) {
      result.actions.push('Animation event ported successfully');
      console.log('🔧 LINKER: Animation event ported successfully');
    } else {
      result.errors.push('Animation event porting failed');
      console.log('🔧 LINKER: Animation event porting failed:', eventPortResult.reason);
      return result;
    }

    // 4. Update resource resolver if needed
    if (connection.resourceResolverKey && !targetResourceResolver[connection.resourceResolverKey]) {
      targetResourceResolver[connection.resourceResolverKey] = generateResourcePath(connection.vfxSystem.name);
      result.actions.push('Resource resolver updated');
    }

    result.success = true;
    console.log('🔧 LINKER: Porting completed successfully!');
    console.log('🔧 LINKER: Final result:', result);

  } catch (error) {
    console.error('🔧 LINKER: Error during porting:', error);
    console.error('🔧 LINKER: Error stack:', error.stack);
    result.errors.push(`Porting failed: ${error.message}`);
  }

  console.log('🔧 LINKER: Returning result:', result);
  return result;
};

/**
 * Port VFX system (reuse existing logic from Port.js)
 * @param {Object} vfxSystem - Source VFX system
 * @param {Object} targetVfxSystems - Target VFX systems
 * @param {string} resourceKey - Resource key
 * @returns {Object} - Porting result
 */
const portVfxSystem = (vfxSystem, targetVfxSystems, resourceKey) => {
  try {
    // Check if VFX system already exists
    if (targetVfxSystems[vfxSystem.name]) {
      return { success: false, reason: 'VFX system already exists' };
    }

    // Port the VFX system with proper structure
    targetVfxSystems[vfxSystem.name] = {
      ...vfxSystem,
      ported: true,
      portedAt: Date.now(),
      originalContent: vfxSystem.rawContent || vfxSystem.fullContent,
      // Preserve emitters structure for Port.js compatibility
      emitters: vfxSystem.emitters || []
    };

    console.log('🔧 VFX System ported:', vfxSystem.name);
    return { success: true };
  } catch (error) {
    console.error('🔧 VFX System porting failed:', error);
    return { success: false, reason: error.message };
  }
};

/**
 * Port animation event
 * @param {Object} particleEvent - Source particle event
 * @param {Object} targetClip - Target animation clip
 * @returns {Object} - Porting result
 */
const portAnimationEvent = (particleEvent, targetClip) => {
  console.log('🔧 EVENT: ===== PORT ANIMATION EVENT =====');
  console.log('🔧 EVENT: Particle event:', JSON.stringify(particleEvent, null, 2));
  console.log('🔧 EVENT: Target clip:', targetClip.name);
  console.log('🔧 EVENT: Target clip events before:', targetClip.events);
  
  // Ensure events structure exists
  if (!targetClip.events) {
    targetClip.events = {};
    console.log('🔧 EVENT: Created events object for clip:', targetClip.name);
  }
  
  if (!targetClip.events.particle) {
    targetClip.events.particle = [];
    console.log('🔧 EVENT: Created particle events array for clip:', targetClip.name);
  }

  console.log('🔧 EVENT: Current particle events count:', targetClip.events.particle.length);

  // Check if event already exists
  const existingEvent = targetClip.events.particle.find(event => 
    event.effectKey === particleEvent.effectKey && 
    event.startFrame === particleEvent.startFrame
  );

  if (existingEvent) {
    console.log('🔧 EVENT: Event already exists, skipping');
    return { success: false, reason: 'Event already exists' };
  }

  // Add the event with ported flag
  const portedEvent = {
    ...particleEvent,
    isPorted: true
  };
  
  console.log('🔧 EVENT: Adding ported event:', JSON.stringify(portedEvent, null, 2));
  targetClip.events.particle.push(portedEvent);
  
  console.log('🔧 EVENT: Target clip events after:', targetClip.events);
  console.log('🔧 EVENT: New particle events count:', targetClip.events.particle.length);
  console.log('🔧 EVENT: Animation event ported successfully:', particleEvent.effectKey);
  
  return { success: true };
};

/**
 * Generate resource path for VFX system
 * @param {string} vfxSystemName - VFX system name
 * @returns {string} - Generated resource path
 */
const generateResourcePath = (vfxSystemName) => {
  // Simple path generation - would be more sophisticated in real implementation
  return `Characters/Generic/VFX/${vfxSystemName}`;
};

/**
 * Get animation event dependencies
 * @param {Object} particleEvent - Particle event
 * @param {Object} vfxSystems - Available VFX systems
 * @returns {Object} - Dependencies information
 */
const getEventDependencies = (particleEvent, vfxSystems) => {
  const dependencies = {
    vfxSystem: null,
    textures: [],
    meshes: [],
    sounds: []
  };

  if (particleEvent.effectKey) {
    const vfxSystem = vfxSystems[particleEvent.effectKey];
    if (vfxSystem) {
      dependencies.vfxSystem = vfxSystem;
      
      // Extract assets from VFX system (simplified)
      if (vfxSystem.rawContent) {
        const textureMatches = vfxSystem.rawContent.match(/\.dds|\.tga|\.png/g);
        if (textureMatches) {
          dependencies.textures = [...new Set(textureMatches)];
        }
        
        const meshMatches = vfxSystem.rawContent.match(/\.scb|\.sco/g);
        if (meshMatches) {
          dependencies.meshes = [...new Set(meshMatches)];
        }
      }
    }
  }

  return dependencies;
};

export {
  linkAnimationWithVfx,
  findVfxSystemForEffectKey,
  portAnimationEventWithVfx,
  getEventDependencies
};
