// ==UserScript==
// @name         WME RPP Auto-Fixer
// @namespace    http://tampermonkey.net/
// @version      3.13.2
// @description  Automatically fixes RPPs as you pan: adds entry/exit points if missing, sets lock rank to 3 if it's 1 or 2, and queues RPPs with no address for deletion. Includes automatic map scanning with ETA!
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @grant        none
// ==/UserScript==

/*
 * WME RPP Auto-Fixer
 * Version: 3.13.2
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
 * - Queues RPPs with no address for deletion (empty houseNumber AND no street)
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

    console.log('Script loaded: WME RPP Auto-Fixer v3.13.2 - Added configurable lock level setting');

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
            this._name = '';       // Optional name for the nav point
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
    const SCAN_ZOOM = 19;                    // Zoom level for scanning (19 = very zoomed in, small tiles, fast loading)
    const MIN_ZOOM_FOR_EDITING = 18;         // Minimum zoom level needed for WME to load complete venue data
    const SCAN_OVERLAP = 0.1;                // 10% overlap between adjacent tiles to ensure no RPPs are missed at boundaries
    const SCAN_DELAY_MS = 500;               // Delay after mergeend event before moving to next tile (ms)
    const SCAN_ZOOM_WAIT_MS = 500;           // Wait time for zoom operation to complete (ms)

    // UI constants
    const UI_UPDATE_THROTTLE_MS = 100;       // Minimum time between UI rebuilds to prevent performance issues (ms)

    // RPP Fix constants
    const RPP_CATEGORY = 'RESIDENCE_HOME';   // WME category identifier for Residential Place Points
    const MAX_PENDING_CHANGES = 100;         // WME performance limit (editor slows down with >100 pending changes)
    const DEFAULT_TARGET_LOCK_LEVEL = 3;     // Default lock level to set (Level 3)
    const STORAGE_KEY_LOCK_LEVEL = 'wmeRppAutoFixerTargetLockLevel';  // localStorage key for saving lock level preference

    // Lock level mappings (WME uses 0-indexed values)
    // Display Level 1 = lockRank 0
    // Display Level 2 = lockRank 1
    // Display Level 3 = lockRank 2
    // Display Level 4 = lockRank 3
    // Display Level 5 = lockRank 4
    // Display Level 6 = lockRank 5

    // Scanner state constants
    const STATE_STOPPED = 'stopped';         // Scanner is not running
    const STATE_RUNNING = 'running';         // Scanner is actively scanning
    const STATE_PAUSED = 'paused';           // Scanner is paused (can be resumed)

    // ============================================================================
    // GLOBAL STATE
    // ============================================================================

    // UI reference
    let tabPaneRef = null;  // Reference to sidebar tab DOM element

    // Auto-fix state
    let autoFixEnabled = true;  // Whether to automatically fix RPPs when found
    let targetLockLevel = DEFAULT_TARGET_LOCK_LEVEL;  // Target lock level to set RPPs to (user-configurable)

    // Session statistics
    const sessionStats = {
        totalFixed: 0,           // Total number of RPPs fixed this session
        entryPointsAdded: 0,     // How many RPPs needed entry points added
        lockLevelsFixed: 0,      // How many RPPs needed lock level changed
        queuedForDeletion: 0,    // How many RPPs queued for deletion (no address)
        fixedVenueIds: new Set(), // Set of venue IDs already fixed (prevents duplicates)
        deletedVenueIds: new Set(), // Set of venue IDs queued for deletion
        pendingChanges: 0,       // Number of unsaved changes (resets to 0 after save)
        totalRPPsSeen: 0,        // Total number of RPPs seen during scanning (fixed + already good)
        lastScanDuration: null   // Duration of last completed scan in milliseconds
    };

    // UI update throttling
    let uiUpdateScheduled = false;  // Flag to prevent too-frequent UI rebuilds
    let uiUpdateTimeout = null;     // Timeout ID for scheduled UI update

    // Scanner state
    const scannerState = {
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
    // SETTINGS PERSISTENCE
    // ============================================================================

    /**
     * Load saved lock level preference from localStorage
     *
     * Retrieves the user's preferred lock level setting from localStorage.
     * Falls back to DEFAULT_TARGET_LOCK_LEVEL if no saved preference exists.
     *
     * @function loadLockLevelPreference
     * @returns {number} The saved lock level (1-6), or default if not found
     */
    function loadLockLevelPreference() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_LOCK_LEVEL);
            if (saved !== null) {
                const level = parseInt(saved, 10);
                // Validate it's in valid range (1-6)
                if (level >= 1 && level <= 6) {
                    console.log(`Loaded saved lock level preference: ${level}`);
                    return level;
                }
            }
        } catch (err) {
            console.error('Error loading lock level preference:', err);
        }
        console.log(`Using default lock level: ${DEFAULT_TARGET_LOCK_LEVEL}`);
        return DEFAULT_TARGET_LOCK_LEVEL;
    }

    /**
     * Save lock level preference to localStorage
     *
     * Persists the user's lock level preference so it's remembered between sessions.
     *
     * @function saveLockLevelPreference
     * @param {number} level - The lock level to save (1-6)
     */
    function saveLockLevelPreference(level) {
        try {
            localStorage.setItem(STORAGE_KEY_LOCK_LEVEL, level.toString());
            console.log(`Saved lock level preference: ${level}`);
        } catch (err) {
            console.error('Error saving lock level preference:', err);
        }
    }

    /**
     * Convert display lock level to WME's internal lockRank value
     *
     * WME uses 0-indexed lockRank values internally:
     * - Display "Level 1" = lockRank 0
     * - Display "Level 2" = lockRank 1
     * - Display "Level 3" = lockRank 2
     * - etc.
     *
     * @function getLockRankFromLevel
     * @param {number} displayLevel - The display level (1-6)
     * @returns {number} The lockRank value (0-5)
     */
    function getLockRankFromLevel(displayLevel) {
        return displayLevel - 1;
    }

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
        console.log('initializeScript: Start');
        try {
            // Load saved lock level preference
            targetLockLevel = loadLockLevelPreference();

            // Register a new sidebar tab in WME
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab('rpp-auto-fixer');
            tabLabel.innerText = '🔧 RPP Fix';
            tabLabel.title = 'Auto-Fix RPPs: Automatically fixes as you pan around';
            tabPane.innerHTML = '<h2>Loading...</h2>';
            tabPaneRef = tabPane;

            // Wait for tab DOM element to be connected to the document
            W.userscripts.waitForElementConnected(tabPane).then(() => {
                // Listen for WME's mergeend event (fires when map data finishes loading)
                // This is the event-driven trigger for scanning (like WME Validator uses)
                W.model.events.on({'mergeend': onMergeEnd});

                // Listen for save completion to reset pending changes counter
                // and auto-resume scanning if it was paused due to reaching limit
                W.model.on('change:isChanged', onSaveComplete);

                // Also scan when WME becomes ready
                document.addEventListener('wme-ready', scanAndFixRPPs);

                // Perform initial scan
                scanAndFixRPPs();
            });

            console.log('initializeScript: Done');
        } catch (err) {
            console.error('initializeScript: error:', err);
        }
    }

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    /**
     * Called when WME's save state changes
     *
     * Monitors WME's isChanged property which indicates if there are unsaved changes.
     * When isChanged becomes false, it means a save just completed.
     *
     * On save completion:
     * - Resets pending changes counter to 0
     * - Auto-resumes scanning if it was paused due to hitting the 100-change limit
     * - Updates UI to reflect the reset counter
     *
     * FIX v3.13.1: Removed the "pendingChanges > 0" condition to ensure counter
     * always resets after save, even if it got out of sync.
     *
     * @function onSaveComplete
     */
    function onSaveComplete() {
        // Check if save just completed (isChanged false = no unsaved changes)
        // FIX: Don't require pendingChanges > 0, always reset when save completes
        if (!W.model.get('isChanged')) {
            // Only log if we actually had changes tracked
            if (sessionStats.pendingChanges > 0) {
                const previousPending = sessionStats.pendingChanges;
                console.log(`💾 Save detected! Resetting pending changes counter (was ${previousPending})`);
            }

            // Reset counter - all changes have been saved
            // This ensures counter doesn't stay stuck at 100 after save
            sessionStats.pendingChanges = 0;

            // Auto-resume scanning if it was paused due to hitting limit
            if (scannerState.status === STATE_PAUSED) {
                console.log('✅ Auto-resuming scan after save...');
                setTimeout(() => {
                    resumeScanning();
                }, 1000); // Brief delay to ensure save is fully complete
            } else {
                // Just update UI to show reset counter
                forceUIUpdate(0);
            }
        }
    }

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

            console.log('Merge complete, scanning tile...');

            // Scan immediately - data is ready!
            scanAndFixRPPs();

            // Give a brief moment for venues to fully render, then move to next tile
            setTimeout(() => {
                scannerState.scanningCurrentTile = false; // Reset flag before moving
                moveToNextScanPosition();                 // Move to next tile
            }, SCAN_DELAY_MS);
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
     * FIX v3.13.1: Added zoom level check to prevent fixing at zoom levels
     * where WME doesn't load complete venue data (requires zoom 18+).
     *
     * @function scanAndFixRPPs
     */
    function scanAndFixRPPs() {
        try {
            // Validate UI is ready
            if (!tabPaneRef) {
                console.error('scanAndFixRPPs: tabPaneRef is null, abort.');
                return;
            }

            // Validate WME venue model is ready
            if (!W.model?.venues) {
                console.error('scanAndFixRPPs: W.model.venues not ready.');
                tabPaneRef.innerHTML = '<p>Error: WME data not ready.</p>';
                return;
            }

            // FIX: Check zoom level - WME doesn't load complete venue data below zoom 18
            // This prevents Actions from silently failing when venues are partially loaded
            const currentZoom = W.map.getZoom();
            if (currentZoom < MIN_ZOOM_FOR_EDITING) {
                console.warn(`⚠️ Zoom level ${currentZoom} is too low for editing (need ${MIN_ZOOM_FOR_EDITING}+). Skipping fix attempts.`);
                // Still update UI but don't try to fix anything
                displayUI(0);
                return;
            }

            // Get all venues currently loaded in WME, filter for RPPs
            const allRPPs = W.model.venues.getObjectArray().filter(v => {
                return v.attributes?.categories?.includes(RPP_CATEGORY);
            });

            // Track total RPPs seen during auto-scan mode
            if (scannerState.status === STATE_RUNNING) {
                sessionStats.totalRPPsSeen += allRPPs.length;
            }

            console.log(`Scan: ${allRPPs.length} RPPs visible, ${sessionStats.fixedVenueIds.size} already fixed, ${sessionStats.deletedVenueIds.size} queued for deletion`);

            // Auto-fix RPPs if enabled
            if (autoFixEnabled) {
                const UpdateObject = require('Waze/Action/UpdateObject');
                const DeleteObject = require('Waze/Action/DeleteObject');
                const MultiAction = require('Waze/Action/MultiAction');
                let fixedThisScan = 0;
                let deletedThisScan = 0;

                allRPPs.forEach(rpp => {
                    const venueId = rpp.attributes.id;

                    // Skip if we've already processed this RPP in this session
                    if (sessionStats.fixedVenueIds.has(venueId) || sessionStats.deletedVenueIds.has(venueId)) {
                        return;
                    }

                    // Check if RPP has a valid address
                    if (!hasValidAddress(rpp)) {
                        // No address - queue for deletion
                        deleteRPP(rpp, DeleteObject);
                        sessionStats.deletedVenueIds.add(venueId);
                        sessionStats.queuedForDeletion++;
                        deletedThisScan++;
                        console.log(`🗑️ Queued for deletion (no address): ${getStreetAddress(rpp)} [ID: ${venueId}]`);
                    } else {
                        // Has address - check what fixes this RPP needs
                        const needsEntryPoint = !rpp.attributes.entryExitPoints?.length;
                        const targetLockRank = getLockRankFromLevel(targetLockLevel);
                        const needsLockFix = (rpp.attributes.lockRank < targetLockRank);

                        if (needsEntryPoint || needsLockFix) {
                            // FIX v3.13.1: Check if fix succeeded before marking as fixed
                            // This prevents marking RPPs as fixed when data wasn't fully loaded
                            const fixSucceeded = fixRPP(rpp, needsEntryPoint, needsLockFix, targetLockRank, UpdateObject);

                            if (fixSucceeded) {
                                // Track this RPP as fixed only if fix succeeded
                                sessionStats.fixedVenueIds.add(venueId);
                                sessionStats.totalFixed++;
                                fixedThisScan++;

                                // Update specific fix counts
                                if (needsEntryPoint) {
                                    sessionStats.entryPointsAdded++;
                                }
                                if (needsLockFix) {
                                    sessionStats.lockLevelsFixed++;
                                }
                            } else {
                                console.warn(`⚠️ Fix failed for RPP ${venueId}, will retry if seen again`);
                            }
                        }
                    }
                });

                if (fixedThisScan > 0 || deletedThisScan > 0) {
                    console.log(`✅ Fixed ${fixedThisScan} RPP(s), queued ${deletedThisScan} for deletion in this scan pass`);
                }
            }

            // Update UI with current RPP count
            displayUI(allRPPs.length);
        } catch (err) {
            console.error('scanAndFixRPPs: error:', err);
            tabPaneRef.innerHTML = '<p>Error scanning RPPs.</p>';
        }
    }

    /**
     * Check if RPP has a valid address
     *
     * An RPP has a valid address if it has EITHER:
     * - A non-empty house number, OR
     * - A valid street ID with a street name
     *
     * If BOTH are missing/empty, the RPP has no address.
     *
     * @function hasValidAddress
     * @param {Object} rpp - The venue object to check
     * @returns {boolean} True if RPP has a valid address, false otherwise
     */
    function hasValidAddress(rpp) {
        if (!rpp?.attributes) {
            return false;
        }

        const houseNum = rpp.attributes.houseNumber || '';
        let streetName = '';

        // Look up street name from street ID
        if (rpp.attributes.streetID) {
            const stObj = W.model.streets.getObjectById(rpp.attributes.streetID);
            if (stObj?.attributes?.name) {
                streetName = stObj.attributes.name;
            }
        }

        // Valid if either house number or street name exists
        const hasHouseNum = houseNum.trim().length > 0;
        const hasStreetName = streetName.trim().length > 0;

        return hasHouseNum || hasStreetName;
    }

    /**
     * Queue an RPP for deletion
     *
     * Queues an RPP for deletion using WME's DeleteObject action.
     * The deletion is queued as a WME action (user must click Save to apply).
     *
     * @function deleteRPP
     * @param {Object} rpp - The venue object to delete
     * @param {Function} DeleteObject - WME's DeleteObject action constructor
     */
    function deleteRPP(rpp, DeleteObject) {
        try {
            const address = getStreetAddress(rpp);

            // Queue the deletion action
            W.model.actionManager.add(new DeleteObject(rpp));

            console.log(`🗑️ Queued for deletion (no address): ${address}`);

            // Track pending change
            sessionStats.pendingChanges++;

            // Auto-pause scan if we've hit the limit
            if (sessionStats.pendingChanges >= MAX_PENDING_CHANGES && scannerState.status === STATE_RUNNING) {
                console.warn(`⚠️ Reached ${MAX_PENDING_CHANGES} pending changes, pausing scan...`);
                pauseScanning();
                alert(`⚠️ You have ${sessionStats.pendingChanges} changes pending!\n\nWME slows down with more than 100 pending changes.\n\nPlease click Save to continue scanning.`);
            }
        } catch (err) {
            console.error('deleteRPP: error:', err);
        }
    }

    /**
     * Fix a single RPP
     *
     * Applies one or both fixes to an RPP:
     * 1. Add entry/exit point at RPP center if missing
     * 2. Set lock level to the user-configured target level
     *
     * All fixes are queued as WME actions (user must click Save to apply)
     *
     * FIX v3.13.1: Added geometry validation to ensure venue data is fully loaded
     * before attempting fixes. This prevents silent failures when data is incomplete.
     *
     * FIX v3.13.2: Added targetLockRank parameter to support configurable lock levels
     * for different state requirements.
     *
     * @function fixRPP
     * @param {Object} rpp - The venue object to fix
     * @param {boolean} needsEntryPoint - Whether to add entry/exit point
     * @param {boolean} needsLockFix - Whether to fix lock level
     * @param {number} targetLockRank - The target lockRank value to set (0-5)
     * @param {Function} UpdateObject - WME's UpdateObject action constructor
     * @returns {boolean} True if fix was successfully queued, false if failed
     */
    function fixRPP(rpp, needsEntryPoint, needsLockFix, targetLockRank, UpdateObject) {
        try {
            const address = getStreetAddress(rpp);

            // Fix 1: Add entry/exit point if missing
            if (needsEntryPoint) {
                try {
                    // FIX: Validate geometry exists and is loaded before accessing
                    const geometry = rpp.getOLGeometry();
                    if (!geometry) {
                        console.warn(`⚠️ Cannot add entry point to ${address}: geometry not loaded`);
                        return false;
                    }

                    // Get the center point of the RPP geometry
                    const point = geometry.getCentroid();
                    if (!point) {
                        console.warn(`⚠️ Cannot add entry point to ${address}: centroid not available`);
                        return false;
                    }

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
                    return false;
                }
            }

            // Fix 2: Set lockRank to user-configured target level
            // Lock levels: 0=L1, 1=L2, 2=L3, 3=L4, etc.
            if (needsLockFix) {
                W.model.actionManager.add(new UpdateObject(rpp, {
                    lockRank: targetLockRank  // Set to user-configured lock level
                }));

                const displayLevel = targetLockRank + 1;  // Convert back to display level for logging
                console.log(`✅ Set lock level ${displayLevel} for: ${address}`);
            }

            // Track pending change (WME has performance issues with >100 pending changes)
            sessionStats.pendingChanges++;

            // Auto-pause scan if we've hit the limit
            if (sessionStats.pendingChanges >= MAX_PENDING_CHANGES && scannerState.status === STATE_RUNNING) {
                console.warn(`⚠️ Reached ${MAX_PENDING_CHANGES} pending changes, pausing scan...`);
                pauseScanning();
                alert(`⚠️ You have ${sessionStats.pendingChanges} changes pending!\n\nWME slows down with more than 100 pending changes.\n\nPlease click Save to continue scanning.`);
            }

            // Return true to indicate fix was successfully queued
            return true;
        } catch (err) {
            console.error('fixRPP: error:', err);
            return false;
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
            if (scannerState.layersVisibility) {
                return;
            } // Already off

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

            console.log('Map layers turned off for faster scanning');
        } catch (err) {
            console.error('turnLayersOff: error:', err);
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
            if (!scannerState.layersVisibility) {
                return;
            } // Nothing to restore

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
            console.log('Map layers restored');
        } catch (err) {
            console.error('turnLayersOn: error:', err);
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
            console.log('Starting automatic scan...');

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

            // Reset scan-specific statistics
            sessionStats.totalRPPsSeen = 0;
            sessionStats.lastScanDuration = null;

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
            }, SCAN_ZOOM_WAIT_MS);
        } catch (err) {
            console.error('startScanning: error:', err);
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
        if (scannerState.status !== STATE_RUNNING) {
            return;
        }

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
                // Calculate scan duration
                const scanDurationMs = Date.now() - scannerState.startTime;
                sessionStats.lastScanDuration = scanDurationMs;
                const durationStr = formatTime(scanDurationMs);

                console.log('✅ Scan complete!');
                stopScanning();
                alert(`Scan complete!\n\nScan duration: ${durationStr}\nTotal RPPs seen: ${sessionStats.totalRPPsSeen}\nRPPs fixed: ${sessionStats.totalFixed}\nRPPs queued for deletion: ${sessionStats.queuedForDeletion}\n\nDon't forget to click Save!`);
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
            console.error('moveToNextScanPosition: error:', err);
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
        console.log('Pausing scan...');
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
        console.log('Resuming scan...');
        scannerState.status = STATE_RUNNING;
        turnLayersOff(); // Turn layers back off when resuming
        forceUIUpdate(0); // Force immediate update, cancel any pending
        setTimeout(moveToNextScanPosition, SCAN_DELAY_MS);
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
        console.log('Stopping scan...');

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
     * Prevents too-frequent UI rebuilds by throttling updates to prevent performance issues.
     * Used during scanning to avoid performance issues from constant DOM manipulation.
     *
     * @function scheduleUIUpdate
     * @param {number} currentViewCount - Number of RPPs in current view
     */
    function scheduleUIUpdate(currentViewCount) {
        if (uiUpdateScheduled) {
            return;
        } // Already scheduled, skip

        uiUpdateScheduled = true;
        uiUpdateTimeout = setTimeout(() => {
            displayUI(currentViewCount);
            uiUpdateScheduled = false;
            uiUpdateTimeout = null;
        }, UI_UPDATE_THROTTLE_MS);
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
        console.log('displayUI: Building UI...');

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

        // === LOCK LEVEL SELECTOR ===
        // FIX v3.13.2: Added configurable lock level for different state requirements
        html += '<div style="background: #f0f4ff; padding: 10px; border-radius: 4px; margin-bottom: 10px; border: 2px solid #5C6BC0;">';
        html += '<p style="margin: 5px 0; font-weight: bold; color: #283593;">🔒 Target Lock Level</p>';
        html += '<p style="margin: 5px 0; font-size: 12px; color: #666;">RPPs will be set to this lock level (different states have different requirements):</p>';
        html += '<select id="rpp-lock-level-select" style="padding: 8px; font-size: 14px; border-radius: 4px; border: 1px solid #5C6BC0; background: white; cursor: pointer; width: 100%; margin-top: 5px;">';
        for (let level = 1; level <= 6; level++) {
            const selected = (level === targetLockLevel) ? ' selected' : '';
            html += `<option value="${level}"${selected}>Level ${level}</option>`;
        }
        html += '</select>';
        html += '</div>';

        // === ZOOM LEVEL WARNING ===
        // FIX v3.13.1: Warn user if zoom level is too low for editing
        const currentZoom = W.map.getZoom();
        if (currentZoom < MIN_ZOOM_FOR_EDITING) {
            html += '<div style="background: #ffebee; padding: 10px; border-radius: 4px; margin-bottom: 10px; border: 2px solid #f44336;">';
            html += '<p style="margin: 5px 0; font-weight: bold; color: #C62828;">⚠️ ZOOM LEVEL TOO LOW</p>';
            html += `<p style="margin: 5px 0; font-size: 12px; color: #666;">Current zoom: ${currentZoom} / Minimum: ${MIN_ZOOM_FOR_EDITING}</p>`;
            html += '<p style="margin: 5px 0; font-size: 12px; color: #666;">Zoom in to level 18 or higher to enable RPP fixing. At this zoom level, WME doesn\'t load complete venue data and fixes won\'t work.</p>';
            html += '</div>';
        }

        // === SCANNER STATUS ===
        if (scannerState.status !== STATE_STOPPED) {
            const isRunning = scannerState.status === STATE_RUNNING;
            html += '<div style="background: ' + (isRunning ? '#e3f2fd' : '#fff9e6') + '; padding: 10px; border-radius: 4px; margin-bottom: 10px; border: 2px solid ' + (isRunning ? '#2196F3' : '#FFC107') + ';">';
            html += '<p style="margin: 5px 0; font-weight: bold; color: ' + (isRunning ? '#1976D2' : '#F57C00') + ';">';
            html += isRunning ? '🔄 SCANNING IN PROGRESS' : '⏸️ SCAN PAUSED';
            html += '</p>';
            html += `<p style="margin: 5px 0; font-size: 12px;">Row ${scannerState.currentRow + 1}/${scannerState.totalRows}, Col ${scannerState.currentCol + 1}/${scannerState.totalCols}</p>`;

            // Calculate and display progress percentage
            // Account for snake pattern: left-to-right on even rows, right-to-left on odd rows
            let tilesCompletedInRow;
            if (scannerState.direction === 1) {
                // Left to right: currentCol directly represents tiles completed in this row
                tilesCompletedInRow = scannerState.currentCol;
            } else {
                // Right to left: need to invert the column index
                // If totalCols=4 and currentCol=2, we've completed tiles at positions 3 and are on 2
                // So completed = totalCols - currentCol - 1 = 4 - 2 - 1 = 1 (col 3 done)
                tilesCompletedInRow = scannerState.totalCols - scannerState.currentCol - 1;
            }
            const tilesCompleted = (scannerState.currentRow * scannerState.totalCols) + tilesCompletedInRow;
            const totalTiles = scannerState.totalRows * scannerState.totalCols;
            const progress = (tilesCompleted / totalTiles * 100).toFixed(1);

            // Progress bar with cyan blue fill
            html += '<div style="margin: 10px 0 5px 0;">';
            html += '  <div style="position: relative; width: 100%; height: 30px; background: white; border: 2px solid #999; border-radius: 6px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">';
            html += `    <div style="position: absolute; top: 0; left: 0; height: 100%; width: ${progress}%; background: linear-gradient(90deg, #00bcd4 0%, #00acc1 100%); transition: width 0.3s ease;"></div>`;
            html += `    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #333; font-size: 14px; text-shadow: 0 0 3px white;">${progress}%</div>`;
            html += '  </div>';
            html += '</div>';

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
        html += `<li style="color: #C62828;">Queued for deletion (no address): ${sessionStats.queuedForDeletion}</li>`;

        // Pending changes with warning color if approaching limit
        const pendingColor = sessionStats.pendingChanges >= MAX_PENDING_CHANGES ? '#C62828' :
                            sessionStats.pendingChanges >= 80 ? '#F57C00' : '#333';
        const pendingWeight = sessionStats.pendingChanges >= 80 ? 'bold' : 'normal';
        html += `<li style="color: ${pendingColor}; font-weight: ${pendingWeight};">Pending changes: ${sessionStats.pendingChanges} / ${MAX_PENDING_CHANGES}</li>`;

        html += '</ul>';

        // Show scan-specific statistics if available
        if (sessionStats.totalRPPsSeen > 0) {
            html += `<p style="margin: 5px 0; font-size: 12px; color: #666;"><strong>Last Scan:</strong> ${sessionStats.totalRPPsSeen} RPPs seen`;
            if (sessionStats.lastScanDuration !== null) {
                html += `, completed in ${formatTime(sessionStats.lastScanDuration)}`;
            }
            html += '</p>';
        }

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
        html += '<li>RPPs with no address are queued for deletion</li>';
        html += '<li>Changes accumulate in save queue</li>';
        html += '<li><strong>Click WME\'s Save button when done</strong></li>';
        html += '</ol>';
        html += '</div>';

        // === SAVE REMINDER ===
        if (sessionStats.totalFixed > 0 || sessionStats.queuedForDeletion > 0) {
            html += '<div style="background: #e3f2fd; padding: 10px; border-radius: 4px; margin-top: 10px; border-left: 4px solid #2196F3;">';
            html += '<p style="margin: 5px 0; font-weight: bold; color: #1976D2;">💾 Don\'t forget to SAVE!</p>';
            html += `<p style="margin: 5px 0; font-size: 12px;">You have ${sessionStats.totalFixed} RPP fixes and ${sessionStats.queuedForDeletion} deletions waiting to be saved.</p>`;
            html += '</div>';
        }

        html += '</div>';
        tabPaneRef.innerHTML = html;

        // === ATTACH EVENT LISTENERS ===
        // Note: Event listeners must be re-attached after each HTML rebuild

        const startScanBtn = document.getElementById('rpp-start-scan-btn');
        if (startScanBtn) {
            startScanBtn.addEventListener('click', startScanning);
        }

        const pauseScanBtn = document.getElementById('rpp-pause-scan-btn');
        if (pauseScanBtn) {
            pauseScanBtn.addEventListener('click', pauseScanning);
        }

        const resumeScanBtn = document.getElementById('rpp-resume-scan-btn');
        if (resumeScanBtn) {
            resumeScanBtn.addEventListener('click', resumeScanning);
        }

        const stopScanBtn = document.getElementById('rpp-stop-scan-btn');
        if (stopScanBtn) {
            stopScanBtn.addEventListener('click', stopScanning);
        }

        const pauseBtn = document.getElementById('rpp-pause-btn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                autoFixEnabled = false;
                console.log('Auto-fix PAUSED');
                displayUI(currentViewCount);
            });
        }

        const resumeBtn = document.getElementById('rpp-resume-btn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => {
                autoFixEnabled = true;
                console.log('Auto-fix RESUMED');
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
                    sessionStats.queuedForDeletion = 0;
                    sessionStats.fixedVenueIds.clear();
                    sessionStats.deletedVenueIds.clear();
                    sessionStats.pendingChanges = 0;
                    sessionStats.totalRPPsSeen = 0;
                    sessionStats.lastScanDuration = null;
                    console.log('Session stats reset');
                    displayUI(currentViewCount);
                }
            });
        }

        // FIX v3.13.2: Add event listener for lock level selector
        const lockLevelSelect = document.getElementById('rpp-lock-level-select');
        if (lockLevelSelect) {
            lockLevelSelect.addEventListener('change', (event) => {
                const newLevel = parseInt(event.target.value, 10);
                if (newLevel >= 1 && newLevel <= 6) {
                    targetLockLevel = newLevel;
                    saveLockLevelPreference(newLevel);
                    console.log(`Target lock level changed to: ${newLevel}`);
                    displayUI(currentViewCount);  // Refresh UI to show new selection
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
        if (!venue?.attributes) {
            return 'No Address';
        }

        const houseNum = venue.attributes.houseNumber || '';
        let streetName = '';

        // Look up street name from street ID
        if (venue.attributes.streetID) {
            const stObj = W.model.streets.getObjectById(venue.attributes.streetID);
            if (stObj?.attributes?.name) {
                streetName = stObj.attributes.name;
            }
        }

        // Combine parts
        const parts = [];
        if (houseNum.trim()) {
            parts.push(houseNum.trim());
        }
        if (streetName.trim()) {
            parts.push(streetName.trim());
        }

        return parts.join(' ') || 'No Address';
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
        if (hours > 0) {
            parts.push(`${hours}h`);
        }
        if (minutes > 0) {
            parts.push(`${minutes}m`);
        }
        if (seconds > 0 || parts.length === 0) {
            parts.push(`${seconds}s`);
        }

        return parts.join(' ');
    }

    // ============================================================================
    // SCRIPT ENTRY POINT
    // ============================================================================

    // Start the script when WME is ready
    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener('wme-ready', initializeScript, { once: true });
    }
})();
