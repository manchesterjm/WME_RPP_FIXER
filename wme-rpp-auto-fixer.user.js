// ==UserScript==
// @name         WME RPP Auto-Fixer
// @namespace    http://tampermonkey.net/
// @version      3.7.0
// @description  Automatically fixes RPPs as you pan: adds entry/exit points if missing, sets lock rank to 3 if it's 1 or 2. Includes automatic map scanning with ETA!
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @grant        none
// ==/UserScript==

/*
 * WME RPP Auto-Fixer
 * Version: 3.7.0
 *
 * OVERVIEW:
 * This script automatically fixes Residential Place Points (RPPs) in the Waze Map Editor.
 * It can work in two modes:
 * 1. Manual Mode: Automatically fixes RPPs as you pan around the map manually
 * 2. Auto-Scan Mode: Automatically pans around the entire visible area fixing all RPPs
 *
 * WHAT IT FIXES:
 * - Adds entry/exit points to RPPs that are missing them
 * - Sets lock level to 3 (from 1 or 2) to prevent casual editors from modifying
 *
 * HOW IT WORKS:
 * - Listens for WME's 'mergeend' event (when map data finishes loading)
 * - Scans for all RPPs in the current viewport
 * - Applies fixes to any RPPs that need them
 * - Tracks fixed RPPs to avoid duplicate fixes
 * - All changes accumulate in WME's save queue (user must click Save)
 *
 * AUTO-SCAN ALGORITHM:
 * - Divides visible area into a grid of overlapping tiles
 * - Uses zoom level 19 for smaller, faster-loading tiles
 * - Scans in a snake pattern (left-to-right, then right-to-left)
 * - Turns off map layers during scan for faster venue data loading
 * - Event-driven: moves to next tile as soon as data is ready
 *
 * INSPIRED BY:
 * - WME Validator's scanning mechanism
 * - NavigationPoint implementation from WME Utils
 *
 * AUTHOR: Created with assistance from Claude (Anthropic)
 * DATE: 2024
 */

(function() {
    'use strict';

    console.log("Script loaded: WME RPP Auto-Fixer v3.7.0 - AUTO-FIX + AUTO-SCAN MODE with ETA");

    // ============================================================================
    // CLASSES
    // ============================================================================

    /**
     * NavigationPoint Class
     *
     * Represents an entry/exit point for a venue (RPP).
     * This class mimics WME's internal NavigationPoint structure.
     *
     * @class NavigationPoint
     * @param {Object} point - GeoJSON point geometry {type: "Point", coordinates: [lon, lat]}
     */
    class NavigationPoint {
        constructor(point) {
            this._point = structuredClone(point);  // Deep clone to avoid reference issues
            this._entry = true;    // Allow entry to RPP from this point
            this._exit = true;     // Allow exit from RPP to this point
            this._isPrimary = true; // Mark as primary navigation point
            this._name = "";       // Optional name for the nav point
        }

        /**
         * Get the point geometry
         * @returns {Object} Deep clone of the point geometry
         */
        getPoint() {
            return structuredClone(this._point);
        }

        /**
         * Check if this is an entry point
         * @returns {boolean} True if entry is allowed
         */
        getEntry() {
            return this._entry;
        }

        /**
         * Check if this is an exit point
         * @returns {boolean} True if exit is allowed
         */
        getExit() {
            return this._exit;
        }

        /**
         * Get the name of this navigation point
         * @returns {string} Name or empty string
         */
        getName() {
            return this._name;
        }

        /**
         * Check if this is the primary navigation point
         * @returns {boolean} True if primary
         */
        isPrimary() {
            return this._isPrimary;
        }

        /**
         * Convert to JSON format for WME
         * @returns {Object} JSON representation
         */
        toJSON() {
            return {
                point: this._point,
                entry: this._entry,
                exit: this._exit,
                primary: this._isPrimary,
                name: this._name
            };
        }
    }

    // ============================================================================
    // CONSTANTS
    // ============================================================================

    // Scanner constants (inspired by WME Validator)
    const SCAN_ZOOM = 19;        // Zoom level for scanning (19 = very zoomed in, small tiles, fast loading)
    const SCAN_OVERLAP = 0.1;    // 10% overlap between adjacent tiles to ensure no RPPs are missed at boundaries

    // Scanner state constants
    const STATE_STOPPED = 'stopped';  // Scanner is not running
    const STATE_RUNNING = 'running';  // Scanner is actively scanning
    const STATE_PAUSED = 'paused';    // Scanner is paused (can be resumed)

    // ============================================================================
    // GLOBAL STATE
    // ============================================================================

    // UI reference
    let tabPaneRef = null;  // Reference to sidebar tab DOM element

    // Auto-fix state
    let autoFixEnabled = true;  // Whether to automatically fix RPPs when found

    // Session statistics
    let sessionStats = {
        totalFixed: 0,           // Total number of RPPs fixed this session
        entryPointsAdded: 0,     // How many RPPs needed entry points added
        lockLevelsFixed: 0,      // How many RPPs needed lock level changed
        fixedVenueIds: new Set() // Set of venue IDs already fixed (prevents duplicates)
    };

    // UI update throttling
    let uiUpdateScheduled = false;  // Flag to prevent too-frequent UI rebuilds
    let uiUpdateTimeout = null;     // Timeout ID for scheduled UI update

    // Scanner state
    let scannerState = {
        status: STATE_STOPPED,         // Current scanner status
        startExtent: null,              // Original map extent when scan started
        startCenter: null,              // Original map center when scan started
        startZoom: null,                // Original zoom level when scan started
        startTime: null,                // Timestamp when scan started (for ETA calculation)
        nextCenter: null,               // Next tile center to pan to
        direction: 1,                   // Scan direction: 1 = left-to-right, -1 = right-to-left (snake pattern)
        firstStep: true,                // Flag for first tile in scan
        currentRow: 0,                  // Current row index in grid
        currentCol: 0,                  // Current column index in grid
        totalRows: 0,                   // Total rows in scan grid
        totalCols: 0,                   // Total columns in scan grid
        stepWidth: 0,                   // Horizontal distance between tile centers
        stepHeight: 0,                  // Vertical distance between tile centers
        layersVisibility: '',           // String storing layer visibility states (T/F for each layer)
        scanningCurrentTile: false      // Flag to prevent duplicate scans of same tile
    };

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Initialize the script
     *
     * Sets up the sidebar tab, registers event listeners, and performs initial scan.
     * Called when WME is ready.
     *
     * @function initializeScript
     */
    function initializeScript() {
        console.log("initializeScript: Start");
        try {
            // Register a new sidebar tab in WME
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab("rpp-auto-fixer");
            tabLabel.innerText = '🔧 RPP Fix';
            tabLabel.title = 'Auto-Fix RPPs: Automatically fixes as you pan around';
            tabPane.innerHTML = '<h2>Loading...</h2>';
            tabPaneRef = tabPane;

            // Wait for tab DOM element to be connected to the document
            W.userscripts.waitForElementConnected(tabPane).then(() => {
                // Listen for WME's mergeend event (fires when map data finishes loading)
                // This is the event-driven trigger for scanning (like WME Validator uses)
                W.model.events.on({'mergeend': onMergeEnd});

                // Also scan when WME becomes ready
                document.addEventListener("wme-ready", scanAndFixRPPs);

                // Perform initial scan
                scanAndFixRPPs();
            });

            console.log("initializeScript: Done");
        } catch (err) {
            console.error("initializeScript: error:", err);
        }
    }

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    /**
     * Called when WME's map merge completes (event-driven)
     *
     * The 'mergeend' event fires when WME finishes loading and merging map data.
     * This is the ideal time to scan because we know the data is ready.
     *
     * In scanning mode:
     * - Scans current tile immediately when data is ready
     * - Moves to next tile after brief delay (500ms)
     * - Prevents duplicate scans with scanningCurrentTile flag
     *
     * In manual mode:
     * - Just scans the current view
     *
     * @function onMergeEnd
     */
    function onMergeEnd() {
        if (scannerState.status === STATE_RUNNING && !scannerState.scanningCurrentTile) {
            // We're scanning and haven't scanned this tile yet

            // Set flag to prevent duplicate scans (mergeend can fire multiple times)
            scannerState.scanningCurrentTile = true;

            console.log("Merge complete, scanning tile...");

            // Scan immediately - data is ready!
            scanAndFixRPPs();

            // Give a brief moment for venues to fully render, then move to next tile
            setTimeout(() => {
                scannerState.scanningCurrentTile = false; // Reset flag before moving
                moveToNextScanPosition();                 // Move to next tile
            }, 500); // Brief 500ms delay (much faster than old 6.5s!)
        } else if (scannerState.status !== STATE_RUNNING) {
            // Manual mode: user is panning around manually
            scanAndFixRPPs();
        }
    }

    // ============================================================================
    // CORE SCANNING & FIXING
    // ============================================================================

    /**
     * Scan for RPPs in current view and auto-fix them
     *
     * This is the core function that:
     * 1. Gets all venues in current viewport
     * 2. Filters for RPPs (RESIDENCE_HOME category)
     * 3. Checks each RPP for issues
     * 4. Fixes issues immediately
     * 5. Tracks fixed RPPs to avoid duplicates
     *
     * @function scanAndFixRPPs
     */
    function scanAndFixRPPs() {
        try {
            // Validate UI is ready
            if (!tabPaneRef) {
                console.error("scanAndFixRPPs: tabPaneRef is null, abort.");
                return;
            }

            // Validate WME venue model is ready
            if (!W.model?.venues) {
                console.error("scanAndFixRPPs: W.model.venues not ready.");
                tabPaneRef.innerHTML = '<p>Error: WME data not ready.</p>';
                return;
            }

            // Get all venues currently loaded in WME, filter for RPPs
            const allRPPs = W.model.venues.getObjectArray().filter(v => {
                return v.attributes?.categories?.includes("RESIDENCE_HOME");
            });

            console.log(`Scan: ${allRPPs.length} RPPs visible, ${sessionStats.fixedVenueIds.size} already fixed this session`);

            // Auto-fix RPPs if enabled
            if (autoFixEnabled) {
                const UpdateObject = require('Waze/Action/UpdateObject');
                let fixedThisScan = 0;

                allRPPs.forEach(rpp => {
                    const venueId = rpp.attributes.id;

                    // Skip if we've already fixed this RPP in this session
                    // This prevents duplicate fixes and wasted processing
                    if (sessionStats.fixedVenueIds.has(venueId)) {
                        return;
                    }

                    // Check what fixes this RPP needs
                    const needsEntryPoint = !rpp.attributes.entryExitPoints?.length;
                    const needsLockFix = (rpp.attributes.lockRank < 2);

                    if (needsEntryPoint || needsLockFix) {
                        // Fix this RPP immediately
                        fixRPP(rpp, needsEntryPoint, needsLockFix, UpdateObject);

                        // Track this RPP as fixed
                        sessionStats.fixedVenueIds.add(venueId);
                        sessionStats.totalFixed++;
                        fixedThisScan++;

                        // Update specific fix counts
                        if (needsEntryPoint) sessionStats.entryPointsAdded++;
                        if (needsLockFix) sessionStats.lockLevelsFixed++;
                    }
                });

                if (fixedThisScan > 0) {
                    console.log(`✅ Fixed ${fixedThisScan} new RPP(s) in this scan pass`);
                }
            }

            // Update UI with current RPP count
            displayUI(allRPPs.length);
        } catch (err) {
            console.error("scanAndFixRPPs: error:", err);
            tabPaneRef.innerHTML = '<p>Error scanning RPPs.</p>';
        }
    }

    /**
     * Fix a single RPP
     *
     * Applies one or both fixes to an RPP:
     * 1. Add entry/exit point at RPP center if missing
     * 2. Set lock level to 3 (from 1 or 2)
     *
     * All fixes are queued as WME actions (user must click Save to apply)
     *
     * @function fixRPP
     * @param {Object} rpp - The venue object to fix
     * @param {boolean} needsEntryPoint - Whether to add entry/exit point
     * @param {boolean} needsLockFix - Whether to fix lock level
     * @param {Function} UpdateObject - WME's UpdateObject action constructor
     */
    function fixRPP(rpp, needsEntryPoint, needsLockFix, UpdateObject) {
        try {
            const address = getStreetAddress(rpp);

            // Fix 1: Add entry/exit point if missing
            if (needsEntryPoint) {
                try {
                    // Get the center point of the RPP geometry
                    const point = rpp.getOLGeometry().getCentroid();

                    // Convert OpenLayers point to GeoJSON format
                    const geoJSONPoint = W.userscripts.toGeoJSONGeometry(point);

                    // Create NavigationPoint object
                    const navPoint = new NavigationPoint(geoJSONPoint);

                    // Queue the update action (doesn't save yet)
                    W.model.actionManager.add(new UpdateObject(rpp, {
                        entryExitPoints: [navPoint]
                    }));

                    console.log(`✅ Added entry point to: ${address}`);
                } catch (err) {
                    console.error(`❌ Failed to add entry point to ${address}:`, err);
                }
            }

            // Fix 2: Set lockRank to 2 (UI displays as level 3)
            // Lock levels: 0=L1, 1=L2, 2=L3, 3=L4, etc.
            if (needsLockFix) {
                W.model.actionManager.add(new UpdateObject(rpp, {
                    lockRank: 2  // Level 3 prevents casual editors from modifying
                }));

                console.log(`✅ Set lock level 3 for: ${address}`);
            }
        } catch (err) {
            console.error("fixRPP: error:", err);
        }
    }

    // ============================================================================
    // LAYER MANAGEMENT (Performance Optimization)
    // ============================================================================

    /**
     * Turn off map layers to speed up venue data loading
     *
     * During scanning, we only need venue data. Turning off other layers
     * (map tiles, satellite imagery, traffic, etc.) reduces bandwidth usage
     * and allows venue data to load much faster.
     *
     * Saves current layer visibility state so we can restore it later.
     *
     * Technique learned from WME Validator.
     *
     * @function turnLayersOff
     */
    function turnLayersOff() {
        try {
            if (scannerState.layersVisibility) return; // Already off

            scannerState.layersVisibility = '';
            const layers = W.map.olMap.layers;

            layers.forEach(layer => {
                if (layer.displayInLayerSwitcher) {
                    // Save current visibility state as T (true) or F (false)
                    if (layer.getVisibility()) {
                        scannerState.layersVisibility += 'T';
                    } else {
                        scannerState.layersVisibility += 'F';
                    }
                    // Turn off the layer
                    layer.setVisibility(false);
                }
            });

            console.log("Map layers turned off for faster scanning");
        } catch (err) {
            console.error("turnLayersOff: error:", err);
        }
    }

    /**
     * Restore map layers to their previous state
     *
     * Restores all layers to the visibility state they had before scanning.
     * Called when scan is paused, stopped, or completed.
     *
     * @function turnLayersOn
     */
    function turnLayersOn() {
        try {
            if (!scannerState.layersVisibility) return; // Nothing to restore

            const layers = W.map.olMap.layers;
            let j = 0;

            layers.forEach(layer => {
                if (layer.displayInLayerSwitcher && scannerState.layersVisibility.length > j) {
                    // Restore visibility from saved state
                    const wasVisible = scannerState.layersVisibility.charAt(j) === 'T';
                    layer.setVisibility(wasVisible);
                    j++;
                }
            });

            scannerState.layersVisibility = '';
            console.log("Map layers restored");
        } catch (err) {
            console.error("turnLayersOn: error:", err);
        }
    }

    // ============================================================================
    // AUTOMATIC SCANNING (Grid-Based)
    // ============================================================================

    /**
     * Start automatic scanning of the visible area
     *
     * Algorithm:
     * 1. Save current position and extent
     * 2. Turn off map layers for performance
     * 3. Zoom to SCAN_ZOOM (19) for optimal tile size
     * 4. Calculate grid of overlapping tiles
     * 5. Begin scanning from top-left corner
     *
     * The grid calculation ensures:
     * - Each tile overlaps its neighbors by 10%
     * - All of the original visible area is covered
     * - Tiles are scanned in snake pattern for efficiency
     *
     * @function startScanning
     */
    function startScanning() {
        try {
            console.log("Starting automatic scan...");

            // Turn off map layers to speed up venue data loading
            turnLayersOff();

            // Get current map extent and save starting position
            const startExtent = W.map.getOLExtent();
            scannerState.startExtent = startExtent;
            scannerState.startCenter = W.map.getCenter();
            scannerState.startZoom = W.map.getZoom();
            scannerState.startTime = Date.now();  // Track start time for ETA calculation
            scannerState.status = STATE_RUNNING;
            scannerState.direction = 1;  // Start going left-to-right
            scannerState.firstStep = true;
            scannerState.currentRow = 0;
            scannerState.currentCol = 0;
            scannerState.scanningCurrentTile = false;

            // Zoom to scan level to get viewport size at that zoom
            W.map.setCenter(scannerState.startCenter, SCAN_ZOOM);

            // Wait for zoom to complete, then calculate grid
            setTimeout(() => {
                // Get viewport size at scan zoom level
                const viewportExtent = W.map.getOLExtent();
                const viewportWidth = viewportExtent.getWidth();
                const viewportHeight = viewportExtent.getHeight();

                // Calculate step size with overlap
                // If viewport is 1000 units and overlap is 10%, step is 900 units
                // This ensures 10% overlap between adjacent tiles
                const stepWidth = viewportWidth * (1 - SCAN_OVERLAP);
                const stepHeight = viewportHeight * (1 - SCAN_OVERLAP);

                // Calculate how many tiles needed to cover start extent
                const totalWidth = startExtent.getWidth();
                const totalHeight = startExtent.getHeight();

                scannerState.totalCols = Math.ceil(totalWidth / stepWidth);
                scannerState.totalRows = Math.ceil(totalHeight / stepHeight);
                scannerState.stepWidth = stepWidth;
                scannerState.stepHeight = stepHeight;

                console.log(`Scan grid: ${scannerState.totalCols} cols × ${scannerState.totalRows} rows`);
                console.log(`Viewport: ${viewportWidth.toFixed(0)} × ${viewportHeight.toFixed(0)}`);
                console.log(`Step: ${stepWidth.toFixed(0)} × ${stepHeight.toFixed(0)} (${SCAN_OVERLAP * 100}% overlap)`);

                // Start from top-left corner
                // Position at center of first tile (half viewport in from edges)
                scannerState.nextCenter = {
                    lon: startExtent.left + viewportWidth / 2,
                    lat: startExtent.top - viewportHeight / 2
                };
                W.map.setCenter(scannerState.nextCenter, SCAN_ZOOM);

                forceUIUpdate(0); // Force immediate update
            }, 500); // Wait 500ms for zoom to complete
        } catch (err) {
            console.error("startScanning: error:", err);
        }
    }

    /**
     * Move to next scan position in the grid
     *
     * Snake pattern scanning:
     * - Row 0: Left to right (col 0, 1, 2, 3...)
     * - Row 1: Right to left (col 3, 2, 1, 0...)
     * - Row 2: Left to right again
     * - etc.
     *
     * This minimizes total pan distance between tiles.
     *
     * Called after scanning current tile is complete.
     *
     * @function moveToNextScanPosition
     */
    function moveToNextScanPosition() {
        if (scannerState.status !== STATE_RUNNING) return;

        try {
            const s = scannerState.startExtent;
            const viewportExtent = W.map.getOLExtent();
            const viewportWidth = viewportExtent.getWidth();
            const viewportHeight = viewportExtent.getHeight();

            // Validate we have grid data
            if (!s || !scannerState.stepWidth) {
                stopScanning();
                return;
            }

            // Calculate next position in snake pattern
            let col = scannerState.currentCol + scannerState.direction;
            let row = scannerState.currentRow;

            // Check if we've reached end of current row
            if (col < 0 || col >= scannerState.totalCols) {
                row++;  // Move to next row
                scannerState.direction = -scannerState.direction; // Reverse direction (snake!)
                col = scannerState.currentCol; // Stay in current column
            }

            // Check if we've scanned all rows (scan complete!)
            if (row >= scannerState.totalRows) {
                console.log("✅ Scan complete!");
                stopScanning();
                alert(`Scan complete!\n\n${sessionStats.totalFixed} RPPs fixed.\n\nDon't forget to click Save!`);
                return;
            }

            // Update position
            scannerState.currentCol = col;
            scannerState.currentRow = row;

            // Calculate new center position
            // Offset from top-left by (col * stepWidth, row * stepHeight)
            // Then add half viewport to center the view
            const newX = s.left + (col * scannerState.stepWidth) + (viewportWidth / 2);
            const newY = s.top - (row * scannerState.stepHeight) - (viewportHeight / 2);
            scannerState.nextCenter = { lon: newX, lat: newY };

            console.log(`Scanning: row ${row + 1}/${scannerState.totalRows}, col ${col + 1}/${scannerState.totalCols}`);

            // Pan to next position (this will trigger mergeend event)
            W.map.setCenter(scannerState.nextCenter, SCAN_ZOOM);

            scheduleUIUpdate(0); // Use throttled update during scanning
        } catch (err) {
            console.error("moveToNextScanPosition: error:", err);
            stopScanning();
        }
    }

    /**
     * Pause automatic scanning
     *
     * Pauses the scan but preserves grid state so it can be resumed.
     * Restores map layers so user can see the map normally.
     *
     * @function pauseScanning
     */
    function pauseScanning() {
        console.log("Pausing scan...");
        scannerState.status = STATE_PAUSED;
        turnLayersOn(); // Restore layers when pausing
        forceUIUpdate(0); // Force immediate update, cancel any pending
    }

    /**
     * Resume automatic scanning
     *
     * Resumes a paused scan from where it left off.
     * Turns layers back off and continues to next tile.
     *
     * @function resumeScanning
     */
    function resumeScanning() {
        console.log("Resuming scan...");
        scannerState.status = STATE_RUNNING;
        turnLayersOff(); // Turn layers back off when resuming
        forceUIUpdate(0); // Force immediate update, cancel any pending
        setTimeout(moveToNextScanPosition, 500); // Wait 500ms (matches onMergeEnd)
    }

    /**
     * Stop automatic scanning
     *
     * Stops the scan completely and returns to starting position.
     * Restores map layers and resets scanner state.
     *
     * @function stopScanning
     */
    function stopScanning() {
        console.log("Stopping scan...");

        // Restore map layers
        turnLayersOn();

        // Return to starting position
        if (scannerState.startCenter && scannerState.startZoom) {
            W.map.setCenter(scannerState.startCenter, scannerState.startZoom);
        }

        // Reset scanner state
        scannerState.status = STATE_STOPPED;
        scannerState.startExtent = null;
        scannerState.startCenter = null;
        scannerState.startZoom = null;
        scannerState.startTime = null;  // Reset start time
        scannerState.scanningCurrentTile = false;
        forceUIUpdate(0); // Force immediate update, cancel any pending
    }

    // ============================================================================
    // UI MANAGEMENT
    // ============================================================================

    /**
     * Schedule UI update (throttled)
     *
     * Prevents too-frequent UI rebuilds by throttling updates to max once per 100ms.
     * Used during scanning to avoid performance issues from constant DOM manipulation.
     *
     * @function scheduleUIUpdate
     * @param {number} currentViewCount - Number of RPPs in current view
     */
    function scheduleUIUpdate(currentViewCount) {
        if (uiUpdateScheduled) return; // Already scheduled, skip

        uiUpdateScheduled = true;
        uiUpdateTimeout = setTimeout(() => {
            displayUI(currentViewCount);
            uiUpdateScheduled = false;
            uiUpdateTimeout = null;
        }, 100); // Wait 100ms before updating
    }

    /**
     * Force immediate UI update
     *
     * Cancels any pending throttled updates and updates UI immediately.
     * Used when user clicks buttons to ensure responsive UI.
     *
     * @function forceUIUpdate
     * @param {number} currentViewCount - Number of RPPs in current view
     */
    function forceUIUpdate(currentViewCount) {
        if (uiUpdateTimeout) {
            clearTimeout(uiUpdateTimeout);
            uiUpdateTimeout = null;
            uiUpdateScheduled = false;
        }
        displayUI(currentViewCount);
    }

    /**
     * Build and display the sidebar UI
     *
     * Creates the entire sidebar interface including:
     * - Auto-fix status indicator
     * - Scanner status and progress
     * - Session statistics
     * - Control buttons (Start/Pause/Resume/Stop)
     * - Instructions
     * - Save reminder
     *
     * Rebuilds entire HTML each time (not ideal but simple).
     * Event listeners are re-attached after each rebuild.
     *
     * @function displayUI
     * @param {number} currentViewCount - Number of RPPs currently visible
     */
    function displayUI(currentViewCount) {
        console.log("displayUI: Building UI...");

        let html = '<div style="padding: 10px;">';
        html += '<h2>🔧 RPP Auto-Fixer</h2>';

        // === AUTO-FIX STATUS ===
        html += '<div style="background: ' + (autoFixEnabled ? '#e8f5e9' : '#ffebee') + '; padding: 10px; border-radius: 4px; margin-bottom: 10px; border: 2px solid ' + (autoFixEnabled ? '#4CAF50' : '#f44336') + ';">';
        html += '<p style="margin: 5px 0; font-weight: bold; color: ' + (autoFixEnabled ? '#2E7D32' : '#C62828') + ';">';
        html += autoFixEnabled ? '✅ AUTO-FIX ENABLED' : '⏸️ AUTO-FIX PAUSED';
        html += '</p>';
        html += '<p style="margin: 5px 0; font-size: 12px; color: #666;">';
        html += autoFixEnabled ? 'RPPs are being fixed automatically as you pan around.' : 'Auto-fix is paused. Click Resume to continue.';
        html += '</p>';
        html += '</div>';

        // === SCANNER STATUS ===
        if (scannerState.status !== STATE_STOPPED) {
            const isRunning = scannerState.status === STATE_RUNNING;
            html += '<div style="background: ' + (isRunning ? '#e3f2fd' : '#fff9e6') + '; padding: 10px; border-radius: 4px; margin-bottom: 10px; border: 2px solid ' + (isRunning ? '#2196F3' : '#FFC107') + ';">';
            html += '<p style="margin: 5px 0; font-weight: bold; color: ' + (isRunning ? '#1976D2' : '#F57C00') + ';">';
            html += isRunning ? '🔄 SCANNING IN PROGRESS' : '⏸️ SCAN PAUSED';
            html += '</p>';
            html += `<p style="margin: 5px 0; font-size: 12px;">Row ${scannerState.currentRow + 1}/${scannerState.totalRows}, Col ${scannerState.currentCol + 1}/${scannerState.totalCols}</p>`;

            // Calculate and display progress percentage
            const tilesCompleted = scannerState.currentRow * scannerState.totalCols + scannerState.currentCol;
            const totalTiles = scannerState.totalRows * scannerState.totalCols;
            const progress = (tilesCompleted / totalTiles * 100).toFixed(1);
            html += `<p style="margin: 5px 0; font-size: 12px;">Progress: ${progress}%</p>`;

            // Calculate and display estimated time remaining
            if (scannerState.startTime && tilesCompleted > 0 && isRunning) {
                const elapsedMs = Date.now() - scannerState.startTime;
                const msPerTile = elapsedMs / tilesCompleted;
                const tilesRemaining = totalTiles - tilesCompleted;
                const estimatedRemainingMs = msPerTile * tilesRemaining;

                html += `<p style="margin: 5px 0; font-size: 12px;">Estimated time remaining: ${formatTime(estimatedRemainingMs)}</p>`;
            }

            html += '</div>';
        }

        // === SESSION STATISTICS ===
        html += '<div style="background: #f0f0f0; padding: 10px; border-radius: 4px; margin-bottom: 10px;">';
        html += '<p style="margin: 5px 0;"><strong>Session Statistics:</strong></p>';
        html += '<ul style="margin: 5px 0 5px 20px;">';
        html += `<li>Total RPPs fixed: <strong>${sessionStats.totalFixed}</strong></li>`;
        html += `<li>Entry points added: ${sessionStats.entryPointsAdded}</li>`;
        html += `<li>Lock levels set to 3: ${sessionStats.lockLevelsFixed}</li>`;
        html += '</ul>';
        html += `<p style="margin: 5px 0; font-size: 12px; color: #666;">Current view: ${currentViewCount} RPPs</p>`;
        html += '</div>';

        // === SCANNER CONTROLS ===
        html += '<div style="margin: 10px 0;">';
        if (scannerState.status === STATE_STOPPED) {
            html += '<button id="rpp-start-scan-btn" style="padding: 10px 20px; font-size: 14px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">🗺️ Start Auto-Scan</button>';
        } else if (scannerState.status === STATE_RUNNING) {
            html += '<button id="rpp-pause-scan-btn" style="padding: 10px 20px; font-size: 14px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">⏸️ Pause Scan</button>';
            html += '<button id="rpp-stop-scan-btn" style="padding: 10px 20px; font-size: 14px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">⏹️ Stop Scan</button>';
        } else if (scannerState.status === STATE_PAUSED) {
            html += '<button id="rpp-resume-scan-btn" style="padding: 10px 20px; font-size: 14px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">▶️ Resume Scan</button>';
            html += '<button id="rpp-stop-scan-btn" style="padding: 10px 20px; font-size: 14px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">⏹️ Stop Scan</button>';
        }
        html += '</div>';

        // === MANUAL CONTROLS ===
        html += '<div style="margin: 10px 0;">';
        if (autoFixEnabled) {
            html += '<button id="rpp-pause-btn" style="padding: 10px 20px; font-size: 14px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">⏸️ Pause Auto-Fix</button>';
        } else {
            html += '<button id="rpp-resume-btn" style="padding: 10px 20px; font-size: 14px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">▶️ Resume Auto-Fix</button>';
        }
        html += '<button id="rpp-reset-stats-btn" style="padding: 10px 20px; font-size: 14px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer;">🔄 Reset Stats</button>';
        html += '</div>';

        // === INSTRUCTIONS ===
        html += '<div style="background: #fff9e6; padding: 10px; border-radius: 4px; margin-bottom: 10px; border-left: 4px solid #FFC107;">';
        html += '<p style="margin: 5px 0; font-weight: bold;">📋 How to use:</p>';
        html += '<ol style="margin: 5px 0 5px 20px; font-size: 12px;">';
        html += '<li><strong>Automatic:</strong> Click "Start Auto-Scan" to scan entire visible area</li>';
        html += '<li><strong>Manual:</strong> Pan around manually, script auto-fixes RPPs</li>';
        html += '<li>Changes accumulate in save queue</li>';
        html += '<li><strong>Click WME\'s Save button when done</strong></li>';
        html += '</ol>';
        html += '</div>';

        // === SAVE REMINDER ===
        if (sessionStats.totalFixed > 0) {
            html += '<div style="background: #e3f2fd; padding: 10px; border-radius: 4px; margin-top: 10px; border-left: 4px solid #2196F3;">';
            html += '<p style="margin: 5px 0; font-weight: bold; color: #1976D2;">💾 Don\'t forget to SAVE!</p>';
            html += `<p style="margin: 5px 0; font-size: 12px;">You have ${sessionStats.totalFixed} RPP fixes waiting to be saved.</p>`;
            html += '</div>';
        }

        html += '</div>';
        tabPaneRef.innerHTML = html;

        // === ATTACH EVENT LISTENERS ===
        // Note: Event listeners must be re-attached after each HTML rebuild

        const startScanBtn = document.getElementById('rpp-start-scan-btn');
        if (startScanBtn) startScanBtn.addEventListener('click', startScanning);

        const pauseScanBtn = document.getElementById('rpp-pause-scan-btn');
        if (pauseScanBtn) pauseScanBtn.addEventListener('click', pauseScanning);

        const resumeScanBtn = document.getElementById('rpp-resume-scan-btn');
        if (resumeScanBtn) resumeScanBtn.addEventListener('click', resumeScanning);

        const stopScanBtn = document.getElementById('rpp-stop-scan-btn');
        if (stopScanBtn) stopScanBtn.addEventListener('click', stopScanning);

        const pauseBtn = document.getElementById('rpp-pause-btn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                autoFixEnabled = false;
                console.log("Auto-fix PAUSED");
                displayUI(currentViewCount);
            });
        }

        const resumeBtn = document.getElementById('rpp-resume-btn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => {
                autoFixEnabled = true;
                console.log("Auto-fix RESUMED");
                scanAndFixRPPs();
            });
        }

        const resetBtn = document.getElementById('rpp-reset-stats-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset session statistics? This will not undo any fixes already made.')) {
                    sessionStats.totalFixed = 0;
                    sessionStats.entryPointsAdded = 0;
                    sessionStats.lockLevelsFixed = 0;
                    sessionStats.fixedVenueIds.clear();
                    console.log("Session stats reset");
                    displayUI(currentViewCount);
                }
            });
        }
    }

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Get formatted street address for a venue
     *
     * Constructs a readable address string from venue data.
     * Format: "HouseNumber StreetName"
     * Example: "123 Main St"
     *
     * @function getStreetAddress
     * @param {Object} venue - The venue object
     * @returns {string} Formatted address or "No Address"
     */
    function getStreetAddress(venue) {
        if (!venue?.attributes) return "No Address";

        const houseNum = venue.attributes.houseNumber || "";
        let streetName = "";

        // Look up street name from street ID
        if (venue.attributes.streetID) {
            const stObj = W.model.streets.getObjectById(venue.attributes.streetID);
            if (stObj?.attributes?.name) {
                streetName = stObj.attributes.name;
            }
        }

        // Combine parts
        const parts = [];
        if (houseNum.trim()) parts.push(houseNum.trim());
        if (streetName.trim()) parts.push(streetName.trim());

        return parts.join(" ") || "No Address";
    }

    /**
     * Format milliseconds into human-readable time string
     *
     * Converts a duration in milliseconds to a readable format.
     * Examples:
     * - 45000 ms → "45s"
     * - 150000 ms → "2m 30s"
     * - 5400000 ms → "1h 30m"
     *
     * @function formatTime
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Formatted time string
     */
    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

        return parts.join(" ");
    }

    // ============================================================================
    // SCRIPT ENTRY POINT
    // ============================================================================

    // Start the script when WME is ready
    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener("wme-ready", initializeScript, { once: true });
    }
})();
