import React, { useState, useRef, useCallback, useEffect } from 'react';
import { textureManager } from '../utils/textureManager';
import { simpleTextureManager } from '../utils/simpleTextureManager';
import './HUDSimulator.css';

const HUDSimulator = ({ hudData, onPositionChange, onDragEndBatch, onDeleteContainer, atlasImage, visibleGroups = {
    abilities: true,
    summoners: true,
    levelUp: true,
    effects: true,
    text: true,
    icons: true,
    regions: true,
    animations: true,
    cooldowns: true,
    desaturate: true,
    ammo: true
  }, visibleLayers = new Set(), selectedSearchElements = new Set() }) => {
  const [selectedElement, setSelectedElement] = useState(null);
  const [selectedElements, setSelectedElements] = useState(new Set());
  const [dragState, setDragState] = useState(null);
  const [marqueeState, setMarqueeState] = useState(null);
  // Logical HUD coordinate space used by League (do not change)
  const [viewportSize] = useState({ width: 1600, height: 1200 });
  // Native preview uses fixed logical space only
  const [highlightedElementIndex, setHighlightedElementIndex] = useState(-1);
  const [opacity, setOpacity] = useState(0.7);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [containersToDelete, setContainersToDelete] = useState(new Set());
  const [dragStartPositions, setDragStartPositions] = useState(new Map());
  const [scale] = useState(1);
  const [fitMode] = useState('fit');
  const [inspectorExpanded, setInspectorExpanded] = useState(true); // Make inspector expandable
  // Removed zoom and pan functionality for simpler coordinate system
  
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);

  // Auto-fit the display on mount
  // useEffect(() => {
  //   const autoFit = () => {
  //     const wrapper = wrapperRef.current;
  //     if (!wrapper) return;
  //     const rect = wrapper.getBoundingClientRect();
  //     const availableWidth = rect.width - 24;
  //     const availableHeight = rect.height - 24;
  //     const scaleX = availableWidth / displaySize.width;
  //     const scaleY = availableHeight / displaySize.height;
  //     const bestScale = Math.min(scaleX, scaleY, 1.5); // Cap at 150% for initial view
  //     setScale(Math.max(0.3, bestScale));
  //   };
  //   
  //   // Small delay to ensure DOM is ready
  //   setTimeout(autoFit, 100);
  // }, [displaySize.width, displaySize.height]);

  // Convert client (screen) coordinates to SVG coordinates reliably using DOMMatrix
  const clientToSvg = useCallback((clientX, clientY) => {
    const svg = canvasRef.current;
    if (!svg || !svg.createSVGPoint) {
      return { x: 0, y: 0 };
    }
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // Parse UI elements from the .py data and convert to the working format
  const parseUIElements = useCallback(() => {
    if (!hudData) return [];
    
    const elements = [];
    const entries = hudData.entries || {};
    
    Object.entries(entries).forEach(([key, data]) => {
      if (data.position && data.position.UIRect) {
        const rect = data.position.UIRect;
        const anchor = data.position.Anchors?.Anchor || { x: 0.5, y: 1 };
        
        // Check if the element has position data
        if (!rect.position) {
          return; // Skip this element
        }
        
        // Use League coordinates directly - they are absolute screen coordinates
        // League uses 1600x1200 resolution, and coordinates are from top-left
        // Y=1054 means 1054 pixels from the TOP of the screen
        // No need for anchor-based transformations - use coordinates as-is
        
        const leagueX = rect.position.x;
        const leagueY = rect.position.y;
        
        const element = {
          id: key,
          name: key, // Use full path to match texture data
          position: { x: leagueX, y: leagueY },
          size: { width: rect.Size?.x || 0, height: rect.Size?.y || 0 },
          anchor: { x: anchor.x, y: anchor.y },
          layer: data.Layer || 0,
          enabled: data.enabled !== false,
          group: determineElementGroup(key, data),
          visible: true,
          // Store original League coordinates for export
          originalPos: { x: rect.position.x, y: rect.position.y },
          // Copy texture data if it exists
          TextureData: data.TextureData || null
        };
        
        elements.push(element);
      }
    });
    
    return elements.sort((a, b) => a.layer - b.layer);
  }, [hudData, viewportSize]);

  const determineElementGroup = (key, data) => {
    // First try to categorize by element type
    if (data.type === 'UiElementTextData') return 'text';
    if (data.type === 'UiElementIconData') return 'icons';
    if (data.type === 'UiElementRegionData') return 'regions';
    if (data.type === 'UiElementEffectAnimationData') return 'animations';
    if (data.type === 'UiElementEffectCooldownRadialData') return 'cooldowns';
    if (data.type === 'UiElementEffectDesaturateData') return 'desaturate';
    if (data.type === 'UiElementEffectAmmoData') return 'ammo';
    
    // Fallback to key-based categorization
    if (key.includes('Ability')) return 'abilities';
    if (key.includes('Summoner')) return 'summoners';
    if (key.includes('LevelUp')) return 'levelUp';
    return 'effects';
  };

  const elements = parseUIElements();

  const filteredElements = elements.filter(element => {
    const groupVisible = visibleGroups[element.group] !== false;
    // If visibleLayers is empty, show all layers. Otherwise, only show layers in the set.
    const layerVisible = visibleLayers.size === 0 || visibleLayers.has(element.layer);
    
    return groupVisible && layerVisible;
  });

  // Get unique layers for controls
  const uniqueLayers = [...new Set(elements.map(el => el.layer))].sort((a, b) => a - b);

  // Navigation functions for sequential highlighting
  const nextElement = useCallback(() => {
    if (filteredElements.length === 0) return;
    setHighlightedElementIndex(prev => 
      prev >= filteredElements.length - 1 ? 0 : prev + 1
    );
  }, [filteredElements.length]);

  const prevElement = useCallback(() => {
    if (filteredElements.length === 0) return;
    setHighlightedElementIndex(prev => 
      prev <= 0 ? filteredElements.length - 1 : prev - 1
    );
  }, [filteredElements.length]);



  // Removed zoom and pan functions

  // Removed zoom and pan functionality

  // Handle mouse events for dragging (simplified without zoom/pan)
  const handleMouseDown = useCallback((e, element) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { x: svgStartX, y: svgStartY } = clientToSvg(e.clientX, e.clientY);

    // If Ctrl is held, begin marquee selection even when clicking on elements
    if (e.ctrlKey) {
      setSelectedElements(new Set());
      setSelectedElement(null);
      setMarqueeState({
        startX: mouseX,
        startY: mouseY,
        endX: mouseX,
        endY: mouseY,
        svgStartX,
        svgStartY,
        svgEndX: svgStartX,
        svgEndY: svgStartY
      });
      return;
    }
    
    // Alt+LeftClick for container deletion
    if (e.altKey) {
      if (containersToDelete.has(element.id)) {
        const newContainersToDelete = new Set(containersToDelete);
        newContainersToDelete.delete(element.id);
        setContainersToDelete(newContainersToDelete);
        if (onDeleteContainer) {
          onDeleteContainer(element.id);
        }
      } else {
        const newContainersToDelete = new Set(containersToDelete);
        newContainersToDelete.add(element.id);
        setContainersToDelete(newContainersToDelete);
      }
      return;
    }
    
    // Handle search element selection
    if (selectedSearchElements.size > 0 && selectedSearchElements.has(element.id)) {
      setSelectedElements(selectedSearchElements);
      setSelectedElement(element.id);
    } else if (selectedElements.size > 0 && selectedElements.has(element.id)) {
      // Continue with existing selection
    } else {
      // Single select (clear others)
      setSelectedElements(new Set([element.id]));
      setSelectedElement(element.id);
    }
    
    // Track start positions for all selected elements
    const startPositions = new Map();
    
    // Always track the dragged element first
    startPositions.set(element.id, { ...element.position });
    
    // If multi-drag, track all other selected elements
    if (selectedElements.size > 1) {
      selectedElements.forEach(elementId => {
        if (elementId !== element.id) { // Don't duplicate the dragged element
          const selectedElement = elements.find(el => el.id === elementId);
          if (selectedElement) {
            startPositions.set(elementId, { ...selectedElement.position });
          }
        }
      });
    }
    

    setDragStartPositions(startPositions);
    
    // Start drag with current mouse position and element position
    setDragState({
      elementId: element.id,
      startX: mouseX,
      startY: mouseY,
      startSvgX: svgStartX,
      startSvgY: svgStartY,
      startPos: { ...element.position }
    });
  }, [selectedElements, containersToDelete, selectedSearchElements, onDeleteContainer]);

  const handleMouseMove = useCallback((e) => {
    // Update cursor position for indicator using precise SVG transform
    if (canvasRef.current) {
      const { x: svgX, y: svgY } = clientToSvg(e.clientX, e.clientY);
      setCursorPosition({ x: Math.round(svgX), y: Math.round(svgY) });
    }
    
    // Handle marquee selection
    if (marqueeState) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { x: svgX, y: svgY } = clientToSvg(e.clientX, e.clientY);
      
      setMarqueeState(prev => ({
        ...prev,
        endX: mouseX,
        endY: mouseY,
        svgEndX: svgX,
        svgEndY: svgY
      }));
      return;
    }
    
    // Handle element dragging
    if (!dragState) return;
    
    const { x: svgX, y: svgY } = clientToSvg(e.clientX, e.clientY);
    
    // Calculate the delta in League coordinate space
    const deltaX = svgX - (dragState.startSvgX ?? 0);
    const deltaY = svgY - (dragState.startSvgY ?? 0);
    
    // Only update on significant movement
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
    
    // Calculate new position in League coordinates
    const draggedNewPos = {
      x: dragState.startPos.x + deltaX,
      y: dragState.startPos.y + deltaY
    };
    
    // Update all selected elements
    if (selectedElements.size > 1) {
      // Multi-drag: move all selected elements by the same delta
      // Use the dragged element as the reference point
      const draggedElement = elements.find(el => el.id === dragState.elementId);
      if (draggedElement) {
        // Calculate the offset from the dragged element's original position
        const offsetX = draggedNewPos.x - draggedElement.position.x;
        const offsetY = draggedNewPos.y - draggedElement.position.y;
        
        // Apply the same offset to all selected elements
        selectedElements.forEach(elementId => {
          const element = elements.find(el => el.id === elementId);
          if (element && onPositionChange) {
            const elementNewPos = {
              x: element.position.x + offsetX,
              y: element.position.y + offsetY
            };
            onPositionChange(elementId, elementNewPos, element?.anchor);
          }
        });
      }
    } else {
      // Single drag: move just the dragged element
      if (onPositionChange) {
        const element = elements.find(el => el.id === dragState.elementId);
        onPositionChange(dragState.elementId, draggedNewPos, element?.anchor);
      }
    }
  }, [dragState, marqueeState, viewportSize, onPositionChange, elements, selectedElements]);

  const handleMouseUp = useCallback(() => {
    // Handle marquee selection end
    if (marqueeState) {
      const selectedIds = new Set();
      const { svgStartX, svgStartY, svgEndX, svgEndY } = marqueeState;

      const minX = Math.min(svgStartX ?? 0, svgEndX ?? 0);
      const maxX = Math.max(svgStartX ?? 0, svgEndX ?? 0);
      const minY = Math.min(svgStartY ?? 0, svgEndY ?? 0);
      const maxY = Math.max(svgStartY ?? 0, svgEndY ?? 0);

      filteredElements.forEach(element => {
        // Element bounds in League coordinate space (no visual scaling)
        const elementRect = {
          x: element.position.x,
          y: element.position.y,
          width: element.size.width,
          height: element.size.height
        };

        const elementLeft = elementRect.x;
        const elementRight = elementRect.x + elementRect.width;
        const elementTop = elementRect.y;
        const elementBottom = elementRect.y + elementRect.height;

        const isIntersecting = !(elementRight < minX || elementLeft > maxX || 
                                 elementBottom < minY || elementTop > maxY);

        if (isIntersecting) {
          selectedIds.add(element.id);
        }
      });

      // If we have existing selections, add to them instead of replacing
      if (selectedElements.size > 0) {
        setSelectedElements(prev => new Set([...prev, ...selectedIds]));
      } else {
        setSelectedElements(selectedIds);
      }
      setMarqueeState(null);
    }
    
    // Handle drag end - save to history (batched by editor)
    if (dragState && dragStartPositions.size > 0) {

      
      // Save final positions for all moved elements
      let hasMovement = false;
      const changes = [];
      dragStartPositions.forEach((startPos, elementId) => {
        const element = elements.find(el => el.id === elementId);
        if (element) {
          // Check if there was actual movement
          if (startPos.x !== element.position.x || startPos.y !== element.position.y) {
            changes.push({ id: elementId, from: { ...startPos }, to: { x: element.position.x, y: element.position.y } });
            hasMovement = true;
          }
        }
      });
      
      if (hasMovement && onDragEndBatch) {
        onDragEndBatch(changes);
      }
    }
    
    setDragState(null);
    setDragStartPositions(new Map());
  }, [marqueeState, filteredElements, dragState, elements, viewportSize, dragStartPositions, onDragEndBatch]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
            setSelectedElements(new Set());
      setSelectedElement(null);
      setHighlightedElementIndex(-1);
      setContainersToDelete(new Set()); // Clear marked containers
    }
  }, []);

  // Calculate the center point of all HUD elements for scaling from center
  const getHUDCenter = useCallback(() => {
    if (filteredElements.length === 0) return { x: viewportSize.width / 2, y: viewportSize.height / 2 };
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    filteredElements.forEach(element => {
      const elementRight = element.position.x + element.size.width;
      const elementBottom = element.position.y + element.size.height;
      
      minX = Math.min(minX, element.position.x);
      minY = Math.min(minY, element.position.y);
      maxX = Math.max(maxX, elementRight);
      maxY = Math.max(maxY, elementBottom);
    });
    
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };
  }, [filteredElements, viewportSize]);

  const hudCenter = getHUDCenter();



  return (
    <div className="hud-simulator-container" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Canvas using SVG like the working example */}
      <div
        ref={wrapperRef}
        className="relative overflow-hidden bg-gray-800"
        style={{ 
          width: '100%', 
          height: '100vh', 
          border: '1px solid #2f3545', 
          borderRadius: '8px', 
          padding: '12px',
          minHeight: '600px'
        }}
      >
        <div style={{ 
          width: '100%', 
          height: '100%', 
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
        <svg
          ref={canvasRef}
          className="cursor-grab"
          viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
          preserveAspectRatio={fitMode === 'stretch' ? 'none' : (fitMode === 'fit' ? 'xMidYMid meet' : 'xMidYMid slice')}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ 
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'block', 
            background: 'transparent' 
          }}
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#374151" strokeWidth="1" opacity="0.3"/>
            </pattern>
          </defs>
          <rect 
            width="100%" 
            height="100%" 
            fill="url(#grid)" 
            onMouseDown={(e) => {
              // Start marquee selection on Ctrl+drag
              if (e.ctrlKey) {
                const rect = canvasRef.current.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                

                
                // Clear existing selections when starting marquee
                setSelectedElements(new Set());
                setSelectedElement(null);
                
                setMarqueeState({
                  startX: mouseX,
                  startY: mouseY,
                  endX: mouseX,
                  endY: mouseY
                });
                return;
              }
              
              // Clear selection when clicking on empty space
              setSelectedElements(new Set());
              setSelectedElement(null);
            }}
            style={{ pointerEvents: 'auto' }}
          />

                      {/* Screen bounds */}
            <rect 
              x="0" y="0" 
              width={viewportSize.width} 
              height={viewportSize.height} 
              fill="none" 
              stroke="#6B7280" 
              strokeWidth="2" 
            />

          {/* Cursor position indicator */}
          <g className="pointer-events-none">
            <circle
              cx={cursorPosition.x}
              cy={cursorPosition.y}
              r="2"
              fill="#FF0000"
              stroke="#FFFFFF"
              strokeWidth="1"
              opacity="0.9"
            />
            <text
              x={cursorPosition.x + 10}
              y={cursorPosition.y - 10}
              fill="#FF0000"
              fontSize="12"
              fontWeight="bold"
            >
              ({cursorPosition.x}, {cursorPosition.y})
            </text>
          </g>

          {/* Reference elements to match League positions */}
          <g className="pointer-events-none">
            {/* League of Legends screen boundaries */}
            <rect
              x="0"
              y="0"
              width={viewportSize.width}
              height={viewportSize.height}
              fill="none"
              stroke="#6B7280"
              strokeWidth="2"
              opacity="0.3"
            />
            
            {/* Actual League screen area */}
            <rect
              x="0"
              y="0"
              width={viewportSize.width}
              height={viewportSize.height}
              fill="none"
              stroke="#22C55E"
              strokeWidth="2"
              opacity="0.5"
            />
            <text
              x="10"
              y="20"
              fill="#22C55E"
              fontSize="12"
              fontWeight="bold"
            >
              Actual League Screen Area
            </text>
            
            {/* Expected ability icons positions - these should be near bottom at Y=1054 */}
            <rect
              x={619 - 32}
              y={1054 - 32}
              width={64}
              height={64}
              fill="none"
              stroke="#00FF00"
              strokeWidth="2"
              opacity="0.7"
            />
            <text
              x={619}
              y={1054 - 40}
              textAnchor="middle"
              className="text-xs fill-green-400"
              fontSize="12"
            >
              Expected Q (619, 1054)
            </text>
            
            {/* Expected summoner spell position */}
            <rect
              x={906 - 24}
              y={1054 - 24}
              width={48}
              height={48}
              fill="none"
              stroke="#FFFF00"
              strokeWidth="2"
              opacity="0.7"
            />
            <text
              x={906}
              y={1054 - 30}
              textAnchor="middle"
              className="text-xs fill-yellow-400"
              fontSize="12"
            >
              Expected Summoner (906, 1054)
            </text>
            
            {/* Level up buttons at Y=988 */}
            <rect
              x={615 - 35}
              y={988 - 35}
              width={70}
              height={70}
              fill="none"
              stroke="#FF00FF"
              strokeWidth="2"
              opacity="0.5"
            />
            <text
              x={615}
              y={988 - 40}
              textAnchor="middle"
              className="text-xs fill-purple-400"
              fontSize="12"
            >
              LevelUp (615, 988)
            </text>
          </g>



          {/* UI Elements */}
          {filteredElements
            .filter(el => visibleGroups[el.group])
            .sort((a, b) => a.layer - b.layer)
            .map((element, index) => {
              // Try to get texture for this element (simple system with fallback)
              const textureData = simpleTextureManager.isTextureLoaded(element.TextureData?.mTextureName) ? 
                simpleTextureManager.getSpriteForElement(element) : 
                textureManager.getSpriteForElement(element);
              // Remove excessive debugging to reduce lag
              
              return (
                <g key={element.id}>
                  {/* Element with texture or fallback rectangle */}
                  {textureData ? (
                    <g>
                      {/* Use actual texture */}
                      <image
                        x={element.position.x}
                        y={element.position.y}
                        width={element.size.width}
                        height={element.size.height}
                        href={textureData}
                        opacity={
                          containersToDelete.has(element.id) ? 1 : // Full opacity for containers marked for deletion
                          selectedElements.has(element.id) || selectedElement === element.id || index === highlightedElementIndex ? 1 : 
                          selectedSearchElements.has(element.id) ? 0.9 :
                          highlightedElementIndex >= 0 ? 0.3 : opacity
                        }
                        className={`cursor-move hover:opacity-80 transition-all duration-200 ${
                          selectedSearchElements.has(element.id) ? 'selected-element-glow' : ''
                        }`}
                        onMouseDown={(e) => handleMouseDown(e, element)}
                        style={{ pointerEvents: 'all' }}
                      />

                    </g>
                  ) : (
                    // Fallback to colored rectangle
                    <rect
                      x={element.position.x}
                      y={element.position.y}
                      width={element.size.width}
                      height={element.size.height}
                      fill={
                        containersToDelete.has(element.id) ? "#DC2626" : // Red for containers marked for deletion
                        selectedElements.has(element.id) ? "#3B82F6" : 
                        selectedElement === element.id ? "#3B82F6" :
                        index === highlightedElementIndex ? "#F59E0B" : // Orange for highlighted
                        "#1F2937"
                      }
                      stroke={
                        containersToDelete.has(element.id) ? "#EF4444" : // Red border for containers marked for deletion
                        selectedElements.has(element.id) ? "#60A5FA" : 
                        selectedElement === element.id ? "#60A5FA" :
                        selectedSearchElements.has(element.id) ? "#f59e0b" : // Orange for search selected elements
                        index === highlightedElementIndex ? "#F59E0B" : // Orange for highlighted
                        (element.size.width === 70 && element.size.height === 70) ? "#FF6B6B" : // Red for 70x70 level up buttons
                        (element.size.width === 66 && element.size.height === 66) ? "#10B981" : // Green for 66x66 abilities  
                        (element.size.width === 48 && element.size.height === 48) ? "#F59E0B" : // Orange for 48x48 summoners
                        "#4B5563"
                      }
                      strokeWidth={
                        selectedElements.has(element.id) || selectedElement === element.id || index === highlightedElementIndex ? "4" :
                        selectedSearchElements.has(element.id) ? "3" :
                        (element.size.width === 70 && element.size.height === 70) ||
                        (element.size.width === 66 && element.size.height === 66) ||
                        (element.size.width === 48 && element.size.height === 48) ? "3" : "2"
                      }
                      opacity={
                        selectedElements.has(element.id) || selectedElement === element.id || index === highlightedElementIndex ? 1 : 
                        selectedSearchElements.has(element.id) ? 0.9 :
                        highlightedElementIndex >= 0 ? 0.3 : opacity
                      }
                      rx="4"
                      className={`cursor-move hover:stroke-blue-400 transition-all duration-200 ${
                        selectedSearchElements.has(element.id) ? 'selected-element-glow' : ''
                      }`}
                      onMouseDown={(e) => handleMouseDown(e, element)}
                      style={{ pointerEvents: 'all' }}
                    />
                  )}
              
              {/* Element label with size info - DISABLED for cleaner view */}
              {false && (
                <text
                  x={element.position.x}
                  y={element.position.y - 8}
                  textAnchor="middle"
                  className="text-xs fill-gray-300 pointer-events-none select-none"
                  fontSize="12"
                >
                  {element.name} ({element.size.width}×{element.size.height})
                </text>
              )}
              
              {/* Center dot */}
              <circle
                cx={element.position.x + element.size.width / 2}
                cy={element.position.y + element.size.height / 2}
                r="2"
                fill="#60A5FA"
                className="pointer-events-none"
              />
            </g>
          );
        })}


          
          {/* Anchor indicators - REMOVED */}
          </svg>
        </div>
        
        {/* Marquee selection overlay - DOM based for visibility */}
        {marqueeState && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${Math.min(marqueeState.startX, marqueeState.endX)}px`,
              top: `${Math.min(marqueeState.startY, marqueeState.endY)}px`,
              width: `${Math.abs(marqueeState.endX - marqueeState.startX)}px`,
              height: `${Math.abs(marqueeState.endY - marqueeState.startY)}px`,
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '3px dashed #60A5FA',
              zIndex: 1000,
              position: 'absolute',
              pointerEvents: 'none'
            }}
          />
        )}
        
        {/* Selection count indicator */}
        {(selectedElements.size > 1 || selectedSearchElements.size > 0) && (
          <div className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded text-sm font-bold">
            {selectedSearchElements.size > 0 ? selectedSearchElements.size : selectedElements.size} elements selected
          </div>
        )}

        {/* Controls Panel */}
          <div className="absolute top-4 left-4 bg-black bg-opacity-90 text-white p-3 rounded text-sm max-w-xs">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">HUD Element Inspector</h4>
            <button
              onClick={() => setInspectorExpanded(!inspectorExpanded)}
              className="text-gray-300 hover:text-white text-xs"
            >
              {inspectorExpanded ? '▼' : '▶'}
            </button>
          </div>
          
          {inspectorExpanded && (
            <>
              {/* Removed zoom controls for simpler interface */}

              {/* Opacity Control */}
              <div className="mb-3">
                <label className="text-xs block mb-1">Element Opacity: {Math.round(opacity * 100)}%</label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Removed resolution/stretch and display scale for native preview */}



              {/* Container Deletion Status */}
              {containersToDelete.size > 0 && (
                <div className="mb-3 p-2 bg-red-900 bg-opacity-50 border border-red-500 rounded">
                  <div className="text-xs text-red-200">
                    {containersToDelete.size} container(s) marked for deletion
                  </div>
                  <div className="text-xs text-red-300 mt-1">
                    Alt+Click again to delete, Escape to clear
                  </div>
                </div>
              )}

              {/* Sequential Navigation */}
            <div className="mb-3">
              <div className="text-xs mb-1">Navigate Elements ({filteredElements.length} total):</div>
              <div className="flex gap-2">
                <button
                  onClick={prevElement}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                  disabled={filteredElements.length === 0}
                >
                  ← Prev
                </button>
                <button
                  onClick={nextElement}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                  disabled={filteredElements.length === 0}
                >
                  Next →
                </button>
                <button
                  onClick={() => setHighlightedElementIndex(-1)}
                  className="px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded text-xs"
                >
                  Clear
                </button>
              </div>
              {highlightedElementIndex >= 0 && (
                <div className="text-xs mt-1 text-yellow-300">
                  Element {highlightedElementIndex + 1} of {filteredElements.length}
                </div>
              )}
            </div>


            {/* Legend */}
            <div className="text-xs border-t border-gray-600 pt-2">
              <div>🟢 66×66 (Abilities) 🔴 70×70 (LevelUp)</div>
              <div>🟠 48×48 (Summoners) 🟨 Highlighted</div>
              <div className="mt-1 text-blue-300">
                <div>Ctrl+Drag: Marquee select</div>
                <div>Escape: Clear selection</div>
              </div>
            </div>
            </>
          )}
        </div>

        {/* Element info panel */}
        {(selectedElements.size > 0 || selectedElement || highlightedElementIndex >= 0) && (() => {
          const element = selectedElements.size > 0 
            ? filteredElements.find(el => el.id === Array.from(selectedElements)[0])
            : selectedElement 
            ? filteredElements.find(el => el.id === selectedElement)
            : filteredElements[highlightedElementIndex];
          
          if (!element) return null;
          
          const isHighlighted = highlightedElementIndex >= 0 && selectedElements.size === 0 && !selectedElement;
          
          return (
            <div className="absolute top-4 right-4 bg-black bg-opacity-90 text-white p-3 rounded text-sm max-w-md">
              <h4 className="font-semibold mb-1 flex items-start gap-2">
                <span className={`w-3 h-3 rounded flex-shrink-0 mt-0.5 ${isHighlighted ? 'bg-yellow-500' : 'bg-blue-500'}`}></span>
                <div className="min-w-0 flex-1">
                  {selectedElements.size > 1 ? `${selectedElements.size} Elements Selected` : (
                    <span className="break-words leading-tight">{element.name}</span>
                  )}
                  {isHighlighted && <span className="text-xs text-yellow-300 block">(Highlighted)</span>}
                </div>
              </h4>
              <div className="text-xs space-y-1">
                {selectedElements.size === 1 && (
                  <>
                    <div><strong>Screen Pos:</strong> {Math.round(element.position.x)}, {Math.round(element.position.y)}</div>
                    <div><strong>League Pos:</strong> {element.originalPos?.x || 'N/A'}, {element.originalPos?.y || 'N/A'}</div>
                    <div><strong>Size:</strong> {element.size.width}×{element.size.height}</div>
                    <div><strong>Layer:</strong> {element.layer}</div>
                    <div><strong>Anchor:</strong> {element.anchor.x}, {element.anchor.y}</div>
                    <div><strong>Group:</strong> {element.group}</div>
                    <div><strong>ID:</strong> <span className="text-gray-400 break-all">{element.id.split('/').pop()}</span></div>
                  </>
                )}
                {selectedElements.size > 1 && (
                  <div>
                    <div><strong>Multi-select:</strong> {selectedElements.size} elements</div>
                    <div><strong>Tip:</strong> Drag to move selected elements together</div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default HUDSimulator;
