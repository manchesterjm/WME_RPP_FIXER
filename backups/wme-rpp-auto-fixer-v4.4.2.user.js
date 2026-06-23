// ==UserScript==
// @name         WME RPP Auto-Fixer
// @namespace    http://tampermonkey.net/
// @version      4.4.2
// @description  Automatically fixes RPPs as you pan: adds entry/exit points if missing, sets lock rank to 3 if 1 or 2, queues RPPs with no address for deletion. v4.1: optional city-fix against USPS preferred names (CO only, opt-in). v4.1.1: retarget RPP in same scan as add_alt. v4.1.2: configurable max-segment-distance (default 300m for rural). v4.1.7: write city-fix names in WME title case (reuse existing city) instead of raw USPS upper case.
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @updateURL    file:///C:/Users/manch/Desktop/WME/RPP-Auto-Fixer/wme-rpp-auto-fixer.user.js
// @downloadURL  file:///C:/Users/manch/Desktop/WME/RPP-Auto-Fixer/wme-rpp-auto-fixer.user.js
// @grant        none
// ==/UserScript==

/**
 * WME RPP Auto-Fixer
 * Version: 4.0.2 - Added version display, reduced UI font sizes
 *
 * @file wme-rpp-auto-fixer.user.js
 *
 * ============================================================================
 * SOFA REFACTORING PREAMBLE
 * ============================================================================
 *
 * This version was refactored to comply with SOFA principles - a set of
 * coding standards that improve code maintainability, testability, and
 * readability.
 *
 * WHAT IS SOFA?
 * -------------
 * SOFA is an acronym for four key principles of clean function design:
 *
 *   S - SHORT
 *       Functions should be concise, ideally 25-40 lines maximum.
 *       Long functions are hard to understand, test, and maintain.
 *
 *   O - ONE THING
 *       Each function should have a single, clear responsibility.
 *       If a function does multiple things, it should be split up.
 *
 *   F - FEW ARGUMENTS
 *       Functions should have 0-3 parameters maximum.
 *       More parameters indicate the function is doing too much.
 *       Use configuration objects for complex inputs.
 *
 *   A - ABSTRACTION LEVEL CONSISTENCY
 *       All operations within a function should be at the same level
 *       of abstraction. Don't mix high-level logic with low-level details.
 *
 * WHAT WAS REFACTORED?
 * --------------------
 * v3.13.4 → v3.14.0 Changes:
 *
 * 1. displayUI() - BEFORE: 235 lines, CC=43 (Very High)
 *                  AFTER: Split into 12 focused builder functions
 *                  - buildAutoFixStatusSection() - 16 lines
 *                  - buildLockLevelSection() - 18 lines
 *                  - buildZoomWarningSection() - 12 lines
 *                  - buildScannerStatusSection() - 26 lines
 *                  - buildProgressBar() - 10 lines
 *                  - buildSessionStatsSection() - 28 lines
 *                  - buildScannerControls() - 16 lines
 *                  - buildManualControls() - 12 lines
 *                  - buildInstructionsSection() - 16 lines
 *                  - buildSaveReminderSection() - 10 lines
 *                  - attachUIEventListeners() - 25 lines
 *                  - displayUI() now just orchestrates: 15 lines
 *
 * 2. scanAndFixRPPs() - BEFORE: 104 lines, CC=20 (High)
 *                       AFTER: Split into focused functions
 *                       - validateScanPrerequisites() - 12 lines
 *                       - isZoomSufficient() - 8 lines
 *                       - getVisibleRPPs() - 5 lines
 *                       - processRPPs() - 16 lines
 *                       - processRPP() - 18 lines
 *                       - attemptRPPFix() - 23 lines
 *
 * 3. fixRPP() - BEFORE: 5 parameters (violated Few-args)
 *               AFTER: Uses config object pattern
 *               fixRPP(config, UpdateObject) where config = {rpp, needsEntryPoint, needsLockFix, targetLockRank}
 *
 * 4. startScanning() - BEFORE: 75 lines
 *                      AFTER: Split into
 *                      - resetSessionStats() - 14 lines
 *                      - initializeScannerState() - 12 lines
 *                      - calculateScanGrid() - 12 lines
 *                      - setInitialScanPosition() - 10 lines
 *
 * COMPLEXITY METRICS IMPROVEMENT:
 * -------------------------------
 * | Metric              | v3.13.4 | v3.14.0 | Improvement |
 * |---------------------|---------|---------|-------------|
 * | Max Cyclomatic CC   | 43      | 9       | 79% better  |
 * | Avg Cyclomatic CC   | 6.5     | 3.1     | 52% better  |
 * | Avg Lines/Function  | 38.7    | 13.4    | 65% better  |
 * | Functions           | 22      | 56      | More focused|
 * | Very High CC (>20)  | 1       | 0       | Eliminated  |
 * | High CC (11-20)     | 1       | 0       | Eliminated  |
 *
 * WHY THIS MATTERS:
 * -----------------
 * - Easier to understand: Each function does one thing
 * - Easier to test: Small functions with clear inputs/outputs
 * - Easier to debug: Errors are isolated to specific functions
 * - Easier to modify: Changes don't cascade through the codebase
 * - Better code reuse: Focused functions can be reused
 *
 * ============================================================================
 */

(function() {
    'use strict';

    /** Script version — single source of truth (also referenced in displayUI sidebar header). */
    const SCRIPT_VERSION = '4.4.2';

    console.log(`🏠 WME RPP Auto-Fixer v${SCRIPT_VERSION} loaded`);

    /**
     * Official WME SDK handle, bound in initWmeSdk(). Preferred over the legacy
     * Waze/Action/* classes (WME v2.354 removed most of them); every mutation
     * helper falls back to the legacy action only when the SDK is unavailable.
     */
    let wmeSdk = null;

    // ============================================================================
    // CLASSES
    // ============================================================================

    /**
     * NavigationPoint - Represents an entry/exit point for a venue
     * @class
     */
    class NavigationPoint {
        constructor(point) {
            this._point = structuredClone(point);
            this._entry = true;
            this._exit = true;
            this._isPrimary = true;
            this._name = '';
        }

        getPoint() {
            return structuredClone(this._point);
        }
        getEntry() {
            return this._entry;
        }
        getExit() {
            return this._exit;
        }
        getName() {
            return this._name;
        }
        isPrimary() {
            return this._isPrimary;
        }

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

    const CONFIG = {
        scan: {
            zoom: 19,
            minZoomForEditing: 17,
            overlap: 0.1,
            scansPerTile: 3,        // Number of scans per tile (catches late-loading RPPs)
            scanIntervalMs: 100,    // Time between scans on same tile
            delayMs: 50,            // Delay after final scan before moving
            zoomWaitMs: 500
        },
        ui: {
            updateThrottleMs: 100
        },
        rpp: {
            category: 'RESIDENCE_HOME',
            maxPendingChanges: 100,
            defaultLockLevel: 3,
            storageKey: 'wmeRppAutoFixerTargetLockLevel'
        }
    };

    const STATE = {
        stopped: 'stopped',
        running: 'running',
        paused: 'paused'
    };

    // ============================================================================
    // GLOBAL STATE
    // ============================================================================

    let tabPaneRef = null;
    let autoFixEnabled = true;
    let targetLockLevel = CONFIG.rpp.defaultLockLevel;
    let uiUpdateScheduled = false;
    let uiUpdateTimeout = null;

    const sessionStats = {
        totalFixed: 0,
        entryPointsAdded: 0,
        lockLevelsFixed: 0,
        queuedForDeletion: 0,
        fixedVenueIds: new Set(),
        deletedVenueIds: new Set(),
        pendingChanges: 0,
        totalRPPsSeen: 0,
        lastScanDuration: null,
        recentFixes: [],  // {venueId, address, lat, lon, timestamp} — newest first, capped at MAX_RECENT_FIXES
        skippedPendingURs: 0,
        skippedDeleteUnavailable: 0
    };

    const MAX_RECENT_FIXES = 25;

    const scannerState = {
        status: STATE.stopped,
        startExtent: null,
        startCenter: null,
        startZoom: null,
        startTime: null,
        nextCenter: null,
        direction: 1,
        firstStep: true,
        currentRow: 0,
        currentCol: 0,
        totalRows: 0,
        totalCols: 0,
        stepWidth: 0,
        stepHeight: 0,
        scanningCurrentTile: false
    };

    // ============================================================================
    // SETTINGS PERSISTENCE
    // ============================================================================

    /**
     * Load saved lock level preference from localStorage
     * @returns {number} Lock level (1-6)
     */
    function loadLockLevelPreference() {
        try {
            const saved = localStorage.getItem(CONFIG.rpp.storageKey);
            if (saved !== null) {
                const level = parseInt(saved, 10);
                if (level >= 1 && level <= 6) {
                    console.log(`Loaded saved lock level preference: ${level}`);
                    return level;
                }
            }
        } catch (err) {
            console.error('Error loading lock level preference:', err);
        }
        return CONFIG.rpp.defaultLockLevel;
    }

    /**
     * Save lock level preference to localStorage
     * @param {number} level - Lock level (1-6)
     */
    function saveLockLevelPreference(level) {
        try {
            localStorage.setItem(CONFIG.rpp.storageKey, level.toString());
        } catch (err) {
            console.error('Error saving lock level preference:', err);
        }
    }

    /**
     * Convert display lock level to WME's internal lockRank
     * @param {number} displayLevel - Display level (1-6)
     * @returns {number} lockRank (0-5)
     */
    function getLockRankFromLevel(displayLevel) {
        return displayLevel - 1;
    }

    // ============================================================================
    // CITY-FIX MODULE (v4.1) — USPS-aligned RPP city normalization
    // ============================================================================
    //
    // Fetches https://github.com/manchesterjm/wme-zip-city-data (co_zip_cities.json
    // + co_zcta.min.geojson), resolves each RPP's ZIP via point-in-polygon on the
    // ZCTA set, and compares the RPP's current city (via streetID -> cityID) to
    // the USPS preferred + recognized list.
    //
    // Policy (per Josh, 2026-04-24):
    //   - Current city matches preferred or any recognized alias -> leave alone
    //   - Otherwise find nearest drivable named segment within 100m
    //   - If that segment has the USPS-preferred city on any of its streets
    //     (primary or alt) -> retarget the RPP's streetID to that street
    //   - If the segment doesn't have the preferred city anywhere -> queue an
    //     AddAlternateStreet action to add it. RPP retarget happens on the NEXT
    //     scan (after user saves), which picks up ok_alt_on_segment instead.
    //
    // Gated behind `settings.cityFixEnabled` (default false, opt-in checkbox).

    const CITY_DATA_URL = 'https://raw.githubusercontent.com/manchesterjm/wme-zip-city-data/main/co_zip_cities.json';
    const CITY_ZCTA_URL = 'https://raw.githubusercontent.com/manchesterjm/wme-zip-city-data/main/co_zcta.min.geojson';
    const CITY_CACHE_KEY = 'rppAutoFixer.cityData';
    const CITY_CACHE_AT_KEY = 'rppAutoFixer.cityDataFetchedAt';
    const ZCTA_CACHE_KEY = 'rppAutoFixer.zctaData';
    const ZCTA_CACHE_AT_KEY = 'rppAutoFixer.zctaDataFetchedAt';
    const CITY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const CITY_DATA_SCHEMA = 4;
    const ZCTA_DATA_SCHEMA = 2;
    const CITY_FIX_ENABLED_KEY = 'rppAutoFixer.cityFixEnabled';
    const CITY_MAX_DIST_KEY = 'rppAutoFixer.cityMaxSegmentDistance';
    const CITY_EXCLUDE_ROAD_TYPES = new Set([3, 4, 5, 10, 18, 19]);
    const CITY_MAX_SEGMENT_DISTANCE_DEFAULT = 300;   // rural CO default — long driveways

    // ---- RPP highlight layer (WMEPH-style triangles; turn OFF when running WMEPH) ----
    const HIGHLIGHT_ENABLED_KEY = 'rppAutoFixer.highlightRPPs';
    const HIGHLIGHT_LAYER_NAME = 'rpp_fixer_highlights';
    const HIGHLIGHT_COLORS = {
        delete: '#FF2D55',  // no street name → deletion candidate
        fix: '#FF9500',     // needs entry point and/or lock raise
        ok: '#00FF00',      // nothing for the fixer to do (pure green)
    };
    let highlightEnabled = false;     // loaded from GM storage on init
    let highlightLayerReady = false;  // layer added to the map (needs SDK)

    let cityData = null;      // { metadata, zips: { "80908": { preferred, recognized, avoid, state } } }
    let zctaData = null;      // { features: [{ properties: {zip}, geometry, _bbox }] }
    let cityFixEnabled = false;  // reloaded from GM storage on init
    let cityMaxSegmentDistance = CITY_MAX_SEGMENT_DISTANCE_DEFAULT;
    let AddAlternateStreet = null;  // legacy action fallback, late-bound in initCityFix
    //
    // NOTE on SDK migration (v4.2.0): WME v2.354 removed the legacy
    // AddAlternateStreet action. The SDK path replaces it with a three-step
    // chain — Cities.getCity/addCity → Streets.getStreet/addStreet →
    // Segments.addAlternateStreet({segmentIds, streetId}) — which also returns
    // the Street object, so the RPP retargets in the same scan instead of
    // waiting for the next one. The legacy action is kept only as a fallback
    // for older WME builds that still expose it.

    // Session counters (added to sessionStats in init)
    const cityStats = {
        retargets: 0,          // RPP streetID updated in place (ok_alt_on_segment)
        altsQueued: 0,         // AddAlternateStreet queued against a segment
        noSegment: 0,          // skipped: no named segment within range
        ambiguous: 0,          // skipped: ZIP has no USPS preferred (ambiguous in our data)
        noData: 0,             // skipped: ZIP not in our dataset
        noZip: 0,              // skipped: outside all CO ZCTAs
        skippedSegmentUR: 0,   // skipped: segment has a pending update request
    };

    function loadCityFixPreference() {
        try {
            if (typeof GM_getValue === 'function') {
                return GM_getValue(CITY_FIX_ENABLED_KEY, false);
            }
        } catch { /* ignore */ }
        return false;
    }

    function saveCityFixPreference(enabled) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(CITY_FIX_ENABLED_KEY, !!enabled);
            }
        } catch { /* ignore */ }
    }

    function loadHighlightPreference() {
        try {
            if (typeof GM_getValue === 'function') {
                return GM_getValue(HIGHLIGHT_ENABLED_KEY, false);
            }
        } catch { /* ignore */ }
        return false;
    }

    function saveHighlightPreference(enabled) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(HIGHLIGHT_ENABLED_KEY, !!enabled);
            }
        } catch { /* ignore */ }
    }

    function loadCityMaxDistance() {
        try {
            if (typeof GM_getValue === 'function') {
                const v = Number(GM_getValue(CITY_MAX_DIST_KEY, CITY_MAX_SEGMENT_DISTANCE_DEFAULT));
                if (isFinite(v) && v >= 25 && v <= 2000) {
                    return v;
                }
            }
        } catch { /* ignore */ }
        return CITY_MAX_SEGMENT_DISTANCE_DEFAULT;
    }

    function saveCityMaxDistance(meters) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(CITY_MAX_DIST_KEY, Number(meters));
            }
        } catch { /* ignore */ }
    }

    /**
     * Fetch a JSON URL once, cache in GM storage for CITY_CACHE_TTL_MS.
     * If requiredSchema > 0, also require cached.metadata.schema >= requiredSchema —
     * so a schema bump auto-invalidates stale caches.
     */
    function loadCityResource(cacheKey, atKey, url, label, requiredSchema) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                return reject(new Error('GM_xmlhttpRequest unavailable — check loader @grant'));
            }
            try {
                const cached = typeof GM_getValue === 'function' ? GM_getValue(cacheKey, null) : null;
                const cachedAt = typeof GM_getValue === 'function' ? GM_getValue(atKey, 0) : 0;
                const fresh = cached && Date.now() - cachedAt < CITY_CACHE_TTL_MS;
                const schemaOK = !requiredSchema
                    || (cached && cached.metadata && cached.metadata.schema >= requiredSchema);
                if (fresh && schemaOK) {
                    console.log(`🏠 city-fix: using cached ${label} (age ${Math.round((Date.now() - cachedAt) / 3600000)}h)`);
                    return resolve(cached);
                }
                if (cached && !schemaOK) {
                    console.log(`🏠 city-fix: cached ${label} is stale (schema bump) — refetching`);
                }
            } catch { /* fall through */ }
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (typeof GM_setValue === 'function') {
                            GM_setValue(cacheKey, data);
                            GM_setValue(atKey, Date.now());
                        }
                        console.log(`🏠 city-fix: fetched ${label}`);
                        resolve(data);
                    } catch (e) {
                        reject(new Error(`${label} parse: ${e.message}`));
                    }
                },
                onerror: () => reject(new Error(`${label} fetch failed`)),
            });
        });
    }

    function prepZctaFeatures(geojson) {
        if (typeof turf === 'undefined') {
            return geojson;
        }
        for (const feat of geojson.features) {
            try {
                feat._bbox = turf.bbox(feat);
            } catch {
                feat._bbox = null;
            }
        }
        return geojson;
    }

    /**
     * Load city data + ZCTA polygons + bind AddAlternateStreet action class.
     * Called from initializeScript(). Resolves silently on success; logs on failure.
     */
    function initCityFix() {
        cityFixEnabled = loadCityFixPreference();
        cityMaxSegmentDistance = loadCityMaxDistance();
        AddAlternateStreet = requireActionClass('Waze/Action/AddAlternateStreet');
        Promise.all([
            loadCityResource(CITY_CACHE_KEY, CITY_CACHE_AT_KEY, CITY_DATA_URL, 'city data', CITY_DATA_SCHEMA),
            loadCityResource(ZCTA_CACHE_KEY, ZCTA_CACHE_AT_KEY, CITY_ZCTA_URL, 'ZCTA polygons', ZCTA_DATA_SCHEMA),
        ]).then(([city, zcta]) => {
            cityData = city;
            zctaData = prepZctaFeatures(zcta);
            console.log(`🏠 city-fix: ready — ${cityData.metadata.zip_count} ZIPs, ${zctaData.features.length} ZCTAs (enabled=${cityFixEnabled}, maxDist=${cityMaxSegmentDistance}m)`);
            if (uiUpdateScheduled === false) {
                scheduleUIUpdate();
            }
        }).catch(err => {
            console.warn('🏠 city-fix: data load failed —', err.message);
        });
    }

    // ---- RPP / segment / street inspection helpers ----

    function cityGetZipFromLocation(rpp) {
        if (!zctaData || typeof turf === 'undefined') {
            return null;
        }
        let lon, lat;
        try {
            const geom = rpp.getOLGeometry?.();
            if (!geom) {
                return null;
            }
            const point = geom.getCentroid?.();
            if (!point) {
                return null;
            }
            const gj = W.userscripts.toGeoJSONGeometry(point);
            lon = gj.coordinates[0];
            lat = gj.coordinates[1];
        } catch {
            return null;
        }
        if (!isFinite(lon) || !isFinite(lat)) {
            return null;
        }
        const pt = turf.point([lon, lat]);
        for (const feat of zctaData.features) {
            const bbox = feat._bbox;
            if (!bbox) {
                continue;
            }
            if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
                continue;
            }
            try {
                if (turf.booleanPointInPolygon(pt, feat)) {
                    return feat.properties.zip;
                }
            } catch { /* skip */ }
        }
        return null;
    }

    /**
     * Trimmed, upper-cased name of a WME city object, or '' if the city is
     * missing or the model's "empty" placeholder. Single source of truth for
     * the case-insensitive city-name comparisons the city-fix relies on.
     */
    function cityNameUpper(city) {
        if (!city?.attributes || city.attributes.isEmpty) {
            return '';
        }
        return (city.attributes.name || '').trim().toUpperCase();
    }

    function cityGetCurrentCity(rpp) {
        const streetID = rpp.attributes.streetID;
        if (!streetID) {
            return '';
        }
        const street = W.model.streets.getObjectById(streetID);
        if (!street?.attributes?.cityID) {
            return '';
        }
        const city = W.model.cities.getObjectById(street.attributes.cityID);
        return cityNameUpper(city);
    }

    function cityResolveStreet(streetID) {
        if (!streetID) {
            return null;
        }
        const s = W.model.streets.getObjectById(streetID);
        if (!s?.attributes) {
            return null;
        }
        const cityID = s.attributes.cityID || null;
        let cityName = '';
        if (cityID) {
            cityName = cityNameUpper(W.model.cities.getObjectById(cityID));
        }
        return {
            streetID,
            name: s.attributes.name || '',
            cityID,
            cityName,
            isEmpty: !!s.attributes.isEmpty,
        };
    }

    /**
     * Convert an UPPER-CASE USPS city name into the name we should actually
     * write to WME. The USPS data is stored upper case for case-insensitive
     * matching, but WME city names are title case — writing the raw upper-case
     * value spawns a duplicate ALL-CAPS city (e.g. "GREENWOOD VILLAGE" instead
     * of reusing the existing "Greenwood Village"). Prefer the real, properly
     * cased name from a city already loaded in the model; fall back to title
     * case only when that city isn't loaded.
     */
    function cityDisplayName(uspsCityName) {
        const nameToMatch = (uspsCityName || '').trim().toUpperCase();
        if (!nameToMatch) {
            return '';
        }
        const loadedCities = W.model.cities;
        if (loadedCities && typeof loadedCities.getObjectArray === 'function') {
            const alreadyInMap = loadedCities.getObjectArray()
                .find(city => cityNameUpper(city) === nameToMatch);
            if (alreadyInMap) {
                return (alreadyInMap.attributes.name || '').trim();
            }
        }
        return cityToTitleCase(nameToMatch);
    }

    function cityToTitleCase(name) {
        return (name || '').toLowerCase().replace(/\b[a-z]/g, ch => ch.toUpperCase());
    }

    function cityFindNearestNamedSegment(rpp) {
        const rppGeom = rpp.getOLGeometry?.();
        if (!rppGeom || typeof rppGeom.distanceTo !== 'function') {
            return null;
        }
        let best = null;
        let bestDist = Infinity;
        const segments = W.model.segments.getObjectArray();
        for (const seg of segments) {
            const rt = seg.attributes?.roadType;
            if (rt === undefined || CITY_EXCLUDE_ROAD_TYPES.has(rt)) {
                continue;
            }
            const primaryID = seg.attributes.primaryStreetID;
            if (!primaryID) {
                continue;
            }
            const primary = W.model.streets.getObjectById(primaryID);
            if (!primary || primary.attributes?.isEmpty) {
                continue;
            }
            let segGeom;
            try {
                segGeom = seg.getOLGeometry(); if (!segGeom) {
                    continue;
                }
            } catch {
                continue;
            }
            let d;
            try {
                d = rppGeom.distanceTo(segGeom);
            } catch {
                continue;
            }
            if (d != null && d < bestDist) {
                bestDist = d; best = seg;
            }
        }
        if (!best || bestDist > cityMaxSegmentDistance) {
            return null;
        }
        return { segment: best, distanceM: bestDist };
    }

    /**
     * Find the nearest segment whose primary street name (or any alt name)
     * matches the RPP's own addressed street name. This is the primary
     * rural-RPP matcher: it uses the existing address-street link instead of
     * pure geometry, so a house 400m up a private driveway still matches to
     * the correct road out at the entrance.
     *
     * Returns {segment, distanceM} or null if no same-named segment exists
     * within a generous cap (twice the geometry cap).
     */
    function cityFindSegmentByRPPStreetName(rpp) {
        const rppStreetID = rpp.attributes?.streetID;
        if (!rppStreetID) {
            return null;
        }
        const rppStreet = W.model.streets.getObjectById(rppStreetID);
        const rppStreetName = (rppStreet?.attributes?.name || '').trim();
        if (!rppStreetName) {
            return null;
        }
        const target = rppStreetName.toLowerCase();

        const rppGeom = rpp.getOLGeometry?.();
        if (!rppGeom || typeof rppGeom.distanceTo !== 'function') {
            return null;
        }

        // Generous cap for name-matched lookup — rural driveways can run several
        // hundred meters. Still bounded to avoid matching a street of the same
        // name in the next county.
        const nameMatchCap = Math.max(cityMaxSegmentDistance * 2, 1000);

        let best = null;
        let bestDist = Infinity;

        const segmentHasStreetName = (seg) => {
            const ids = [seg.attributes.primaryStreetID, ...(seg.attributes.streetIDs || [])];
            for (const id of ids) {
                if (!id) {
                    continue;
                }
                const s = W.model.streets.getObjectById(id);
                const n = (s?.attributes?.name || '').trim().toLowerCase();
                if (n && n === target) {
                    return true;
                }
            }
            return false;
        };

        const segments = W.model.segments.getObjectArray();
        for (const seg of segments) {
            const rt = seg.attributes?.roadType;
            if (rt === undefined || CITY_EXCLUDE_ROAD_TYPES.has(rt)) {
                continue;
            }
            if (!segmentHasStreetName(seg)) {
                continue;
            }

            let segGeom;
            try {
                segGeom = seg.getOLGeometry(); if (!segGeom) {
                    continue;
                }
            } catch {
                continue;
            }
            let d;
            try {
                d = rppGeom.distanceTo(segGeom);
            } catch {
                continue;
            }
            if (d != null && d < bestDist) {
                bestDist = d; best = seg;
            }
        }

        if (!best || bestDist > nameMatchCap) {
            return null;
        }
        return { segment: best, distanceM: bestDist };
    }

    function cityHasPendingUpdateRequests(segment) {
        const urs = segment?.attributes?.segmentUpdateRequests;
        return Array.isArray(urs) && urs.length > 0;
    }

    /**
     * Classify an RPP's city situation and return an action descriptor or null.
     * @returns {null | {type:'ok'} | {type:'skip', reason} | {type:'retarget', newStreetID}
     *                 | {type:'add_alt', segment, streetName, cityName}}
     */
    function cityClassify(rpp) {
        if (!cityData || !zctaData) {
            return null;
        }
        const zip = cityGetZipFromLocation(rpp);
        if (!zip) {
            cityStats.noZip++; return { type: 'skip', reason: 'no_zip' };
        }
        const entry = cityData.zips[zip];
        if (!entry) {
            cityStats.noData++; return { type: 'skip', reason: 'no_data' };
        }
        const preferred = entry.preferred || null;
        const recognized = entry.recognized || [];
        if (!preferred) {
            cityStats.ambiguous++; return { type: 'skip', reason: 'ambiguous' };
        }

        const current = cityGetCurrentCity(rpp);
        if (current && (current === preferred || recognized.includes(current))) {
            return { type: 'ok' };
        }

        // Primary strategy: find a segment on the RPP's OWN named street (the
        // street the RPP is already addressed to). Works even when the house
        // is far from the road (rural driveways). Falls back to nearest-named
        // segment if the RPP has no street name or no same-named segment is
        // loaded in the current view.
        let near = cityFindSegmentByRPPStreetName(rpp);
        if (!near) {
            near = cityFindNearestNamedSegment(rpp);
        }
        if (!near) {
            cityStats.noSegment++; return { type: 'skip', reason: 'no_segment' };
        }
        if (cityHasPendingUpdateRequests(near.segment)) {
            cityStats.skippedSegmentUR++;
            return { type: 'skip', reason: 'segment_pending_ur' };
        }

        const primary = cityResolveStreet(near.segment.attributes.primaryStreetID);
        const altIDs = near.segment.attributes.streetIDs || [];
        const alts = altIDs.map(cityResolveStreet).filter(Boolean);
        const segmentStreets = [primary, ...alts].filter(Boolean);
        const valid = new Set([preferred, ...recognized]);
        const matching = segmentStreets.find(s => s.cityName && valid.has(s.cityName));

        if (matching) {
            return { type: 'retarget', newStreetID: matching.streetID, cityName: matching.cityName };
        }
        // Need to add USPS-preferred as an alt on this segment, using the primary
        // street's NAME (that's the street we're adding a different-city version of).
        const streetName = primary?.name || '';
        if (!streetName || (!wmeSdk && !AddAlternateStreet)) {
            return { type: 'skip', reason: 'no_action_available' };
        }
        return { type: 'add_alt', segment: near.segment, streetName, cityName: preferred };
    }

    /**
     * Apply a city-fix plan for one RPP. For 'retarget', sets streetID on the
     * update props object (so it's bundled with the caller's main UpdateObject).
     * For 'add_alt', queues a separate AddAlternateStreet action on the segment.
     * Returns a short status string for stat tracking, or null for no-op.
     */
    function applyCityFix(rpp, plan, updateProps) {
        if (!plan) {
            return null;
        }
        if (plan.type === 'ok' || plan.type === 'skip') {
            return null;
        }

        // Defensive guard: re-check current city right before applying.
        // The plan was built earlier in the scan; venue state may have settled
        // since then. If current city is now in the valid set (preferred or
        // recognized alias), abort to avoid corrupting an already-correct RPP.
        const recheckZip = cityGetZipFromLocation(rpp);
        const recheckEntry = recheckZip ? cityData?.zips?.[recheckZip] : null;
        if (recheckEntry?.preferred) {
            const recheckCurrent = cityGetCurrentCity(rpp);
            const validCities = new Set([recheckEntry.preferred, ...(recheckEntry.recognized || [])]);
            if (recheckCurrent && validCities.has(recheckCurrent)) {
                console.log(`🏠 city-fix: GUARD aborted ${plan.type} on RPP ${rpp.attributes.id} — current "${recheckCurrent}" is valid for ZIP ${recheckZip}`);
                return null;
            }
        }

        if (plan.type === 'retarget') {
            updateProps.streetID = plan.newStreetID;
            cityStats.retargets++;
            console.log(`🏠 city-fix: retarget ${rpp.attributes.id} -> "${plan.cityName}" (streetID=${plan.newStreetID})`);
            return 'retargeted';
        }
        if (plan.type === 'add_alt') {
            // Resolve the USPS upper-case city to WME's properly-cased name
            // so we reuse the existing city instead of creating an ALL-CAPS
            // duplicate (e.g. "Greenwood Village", not "GREENWOOD VILLAGE").
            const cityName = cityDisplayName(plan.cityName);
            if (wmeSdk) {
                return applyAddAltViaSdk(rpp, plan, cityName, updateProps);
            }
            if (!AddAlternateStreet) {
                console.warn('🏠 city-fix: no SDK and no AddAlternateStreet action — cannot add alt to segment', plan.segment.attributes.id);
                return null;
            }
            try {
                W.model.actionManager.add(new AddAlternateStreet(plan.segment, {
                    streetName: plan.streetName,
                    cityName,
                }));
                cityStats.altsQueued++;
                sessionStats.pendingChanges++;
                console.log(`🏠 city-fix: queued alt "${plan.streetName}" / "${cityName}" on segment ${plan.segment.attributes.id}`);

                // AddAlternateStreet updates the in-memory model synchronously —
                // the segment's streetIDs array now includes the new alt street.
                // Look it up immediately and retarget the RPP in the same scan,
                // so the add_alt-triggering RPP doesn't have to wait for the
                // next scan to get its city right.
                const newStreetID = findMatchingAltStreetID(
                    plan.segment, plan.streetName, cityName
                );
                if (newStreetID != null) {
                    updateProps.streetID = newStreetID;
                    cityStats.retargets++;
                    console.log(`🏠 city-fix: also retargeted RPP ${rpp.attributes.id} -> streetID=${newStreetID} in same scan`);
                    return 'alt_queued_and_retargeted';
                }
                // Fallback: couldn't find the new street (maybe action is
                // async in some WME version). RPP will retarget on next scan.
                console.log('🏠 city-fix: new street not yet visible on segment — RPP will retarget on next scan');
                return 'alt_queued';
            } catch (err) {
                console.error('🏠 city-fix: AddAlternateStreet failed:', err);
                return null;
            }
        }
        return null;
    }

    /**
     * SDK path for the add_alt plan: find-or-create the city and street, add
     * the street as an alternate on the segment, then retarget the RPP in the
     * same scan (addStreet/getStreet hand back the Street, so there is no
     * waiting for the model to settle like the legacy path needed).
     * Returns the same status strings as the legacy path for stat tracking.
     */
    function applyAddAltViaSdk(rpp, plan, cityName, updateProps) {
        const segmentId = plan.segment.attributes.id;
        try {
            const { Cities, Streets, Segments } = wmeSdk.DataModel;
            const city = Cities.getCity({ cityName }) ?? Cities.addCity({ cityName });
            const street = Streets.getStreet({ streetName: plan.streetName, cityId: city.id })
                ?? Streets.addStreet({ streetName: plan.streetName, cityId: city.id });
            Segments.addAlternateStreet({ segmentIds: [segmentId], streetId: street.id });
            cityStats.altsQueued++;
            sessionStats.pendingChanges++;
            console.log(`🏠 city-fix: queued alt "${plan.streetName}" / "${cityName}" on segment ${segmentId} (SDK)`);

            updateProps.streetID = street.id;
            cityStats.retargets++;
            console.log(`🏠 city-fix: also retargeted RPP ${rpp.attributes.id} -> streetID=${street.id} in same scan`);
            return 'alt_queued_and_retargeted';
        } catch (err) {
            console.error(`🏠 city-fix: SDK add-alt failed on segment ${segmentId}:`, err);
            return null;
        }
    }

    /**
     * Given a segment that we just queued an AddAlternateStreet on, find the
     * streetID of the newly-added alt street matching (name, cityName).
     * Returns null if not found (action may be async, or name mismatch).
     */
    function findMatchingAltStreetID(segment, streetName, cityName) {
        const altIDs = segment.attributes.streetIDs || [];
        const targetCity = (cityName || '').toUpperCase();
        for (const id of altIDs) {
            const street = W.model.streets.getObjectById(id);
            if (!street?.attributes) {
                continue;
            }
            if ((street.attributes.name || '') !== streetName) {
                continue;
            }
            const cityID = street.attributes.cityID;
            if (!cityID) {
                continue;
            }
            const city = W.model.cities.getObjectById(cityID);
            if (!city?.attributes || city.attributes.isEmpty) {
                continue;
            }
            const cityNameUC = cityNameUpper(city);
            if (cityNameUC === targetCity) {
                return id;
            }
        }
        return null;
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Bind the official WME SDK. Waits for the page's SDK_INITIALIZED promise,
     * then logs a capability summary (which mutation paths are SDK vs legacy vs
     * dead) so a glance at the console shows what this WME build supports.
     */
    function initWmeSdk() {
        if (typeof getWmeSdk !== 'function') {
            console.warn('🏠 WME SDK not present (getWmeSdk missing) — legacy actions only');
            logActionCapabilities();
            return;
        }
        const sdkReady = window.SDK_INITIALIZED || Promise.resolve();
        sdkReady.then(() => {
            wmeSdk = getWmeSdk({ scriptId: 'wme-rpp-auto-fixer', scriptName: 'WME RPP Auto-Fixer' });
            logActionCapabilities();
            initHighlightLayer();
        }).catch(err => {
            console.warn('🏠 WME SDK init failed — legacy actions only:', err.message);
            logActionCapabilities();
        });
    }

    /**
     * Add the RPP highlight layer to the map (WMEPH-style: SDK layer with
     * style rules; triangles so they read differently from WMEPH's marks).
     * Called once after the SDK binds. Features are (re)built per scan by
     * refreshRPPHighlights().
     */
    function initHighlightLayer() {
        if (!wmeSdk) {
            return;
        }
        try {
            wmeSdk.Map.addLayer({
                layerName: HIGHLIGHT_LAYER_NAME,
                zIndexing: true,
                styleContext: {
                    getStatusColor: ({ feature }) => HIGHLIGHT_COLORS[feature?.properties?.status] || '#888888',
                    getPointRadius: ({ zoomLevel }) => (zoomLevel > 17 ? 14 : 9),
                },
                styleRules: [{
                    style: {
                        pointRadius: '${getPointRadius}',
                        graphicName: 'triangle',
                        fillColor: '${getStatusColor}',
                        fillOpacity: 0.2,
                        strokeColor: '${getStatusColor}',
                        strokeWidth: 4,
                        strokeOpacity: 0.9,
                    },
                }],
            });
            try {
                const venuesZIndex = wmeSdk.Map.getLayerZIndex({ layerName: 'venues' });
                wmeSdk.Map.setLayerZIndex({ layerName: HIGHLIGHT_LAYER_NAME, zIndex: venuesZIndex + 3 });
            } catch { /* optional — layer still renders without an explicit z-index */ }
            highlightLayerReady = true;
            console.log(`🏠 highlight layer ready (enabled=${highlightEnabled})`);
        } catch (err) {
            console.warn('🏠 highlight layer init failed:', err.message);
        }
    }

    /**
     * What would the fixer do with this RPP? Drives the highlight color.
     * Mirrors processRPP's decision order: street-less RPPs are deletion
     * candidates; otherwise check entry point + lock. (City-fix is excluded —
     * its ZIP/segment lookups are too heavy to run per venue per pan.)
     */
    function rppHighlightStatus(rpp) {
        if (!hasValidAddress(rpp)) {
            return 'delete';
        }
        const needsEntryPoint = !rpp.attributes.entryExitPoints?.length;
        const needsLockFix = rpp.attributes.lockRank < getLockRankFromLevel(targetLockLevel);
        return (needsEntryPoint || needsLockFix) ? 'fix' : 'ok';
    }

    /**
     * Rebuild the highlight layer for the given RPPs (clears first, adds one
     * triangle per RPP colored by status). Pass [] to just clear — used when
     * the toggle goes off or the zoom drops below editing range.
     */
    function refreshRPPHighlights(rpps) {
        if (!highlightLayerReady) {
            return;
        }
        try {
            wmeSdk.Map.removeAllFeaturesFromLayer({ layerName: HIGHLIGHT_LAYER_NAME });
            if (!highlightEnabled) {
                return;
            }
            for (const rpp of rpps) {
                try {
                    const geometry = rpp.getOLGeometry();
                    if (!geometry) {
                        continue;
                    }
                    wmeSdk.Map.addFeatureToLayer({
                        layerName: HIGHLIGHT_LAYER_NAME,
                        feature: {
                            type: 'Feature',
                            id: `rpp_hl_${rpp.attributes.id}`,
                            geometry: W.userscripts.toGeoJSONGeometry(geometry),
                            properties: { status: rppHighlightStatus(rpp) },
                        },
                    });
                } catch { /* skip this venue */ }
            }
        } catch (err) {
            console.warn('🏠 highlight refresh failed:', err.message);
        }
    }

    /** One-line console summary of which mutation paths are available. */
    function logActionCapabilities() {
        const legacyUpdate = !!requireActionClass('Waze/Action/UpdateObject');
        const legacyDelete = !!requireActionClass('Waze/Action/DeleteObject');
        const cap = (sdkOk, legacyOk) => sdkOk ? 'SDK' : (legacyOk ? 'legacy' : 'NONE');
        console.log(`🏠 capabilities: update=${cap(!!wmeSdk, legacyUpdate)}, delete=${cap(!!wmeSdk, legacyDelete)}, add-alt=${cap(!!wmeSdk, !!AddAlternateStreet)}`);
    }

    /**
     * Initialize the script
     */
    function initializeScript() {
        console.log('initializeScript: Start');
        try {
            targetLockLevel = loadLockLevelPreference();
            highlightEnabled = loadHighlightPreference();
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab('rpp-auto-fixer');
            setupTabUI(tabLabel, tabPane);
            initCityFix();
            initWmeSdk();
        } catch (err) {
            console.error('initializeScript: error:', err);
        }
    }

    /**
     * Setup the sidebar tab UI
     * @param {HTMLElement} tabLabel - Tab label element
     * @param {HTMLElement} tabPane - Tab pane element
     */
    function setupTabUI(tabLabel, tabPane) {
        tabLabel.innerText = '🔧 RPP Fix';
        tabLabel.title = 'Auto-Fix RPPs: Automatically fixes as you pan around';
        tabPane.innerHTML = '<h2>Loading...</h2>';
        tabPaneRef = tabPane;

        W.userscripts.waitForElementConnected(tabPane).then(() => {
            registerEventListeners();
            scanAndFixRPPs();
        });
        console.log('initializeScript: Done');
    }

    /**
     * Register all WME event listeners
     */
    function registerEventListeners() {
        W.model.events.on({ 'mergeend': onMergeEnd });
        // Listen for save completion via actionManager
        W.model.actionManager.events.on({
            'afterclearactions': onSaveComplete
        });
        document.addEventListener('wme-ready', scanAndFixRPPs);
        console.log('RPP Auto-Fixer: Event listeners registered successfully');
    }

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    /**
     * Handle WME save completion (called when actions are cleared after save)
     */
    function onSaveComplete() {
        if (sessionStats.pendingChanges > 0) {
            console.log(`💾 Save detected! Resetting pending changes counter (was ${sessionStats.pendingChanges})`);
        }
        sessionStats.pendingChanges = 0;

        if (scannerState.status === STATE.paused) {
            console.log('✅ Auto-resuming scan after save...');
            setTimeout(resumeScanning, 1000);
        } else {
            forceUIUpdate();
        }
    }

    /**
     * Handle WME map merge completion
     * Performs multiple scans per tile to catch late-loading RPPs
     */
    function onMergeEnd() {
        if (scannerState.status === STATE.running && !scannerState.scanningCurrentTile) {
            scannerState.scanningCurrentTile = true;
            console.log('Merge complete, starting multi-scan sequence...');

            // Schedule multiple scans to catch late-loading RPPs
            const { scansPerTile, scanIntervalMs, delayMs } = CONFIG.scan;

            for (let i = 0; i < scansPerTile; i++) {
                const isLastScan = (i === scansPerTile - 1);
                setTimeout(() => {
                    console.log(`Scan ${i + 1}/${scansPerTile} on current tile...`);
                    scanAndFixRPPs(isLastScan); // Only update UI on last scan
                }, i * scanIntervalMs);
            }

            // Move to next tile after all scans complete + delay
            const totalTileTime = (scansPerTile - 1) * scanIntervalMs + delayMs;
            setTimeout(() => {
                scannerState.scanningCurrentTile = false;
                moveToNextScanPosition();
            }, totalTileTime);
        } else if (scannerState.status !== STATE.running) {
            scanAndFixRPPs(true);
        }
    }

    // ============================================================================
    // CORE SCANNING - SOFA Compliant
    // ============================================================================

    /**
     * Check if prerequisites for scanning are met
     * @returns {boolean} True if ready to scan
     */
    function validateScanPrerequisites() {
        if (!tabPaneRef) {
            console.error('scanAndFixRPPs: tabPaneRef is null, abort.');
            return false;
        }
        if (!W.model?.venues) {
            console.error('scanAndFixRPPs: W.model.venues not ready.');
            tabPaneRef.innerHTML = '<p>Error: WME data not ready.</p>';
            return false;
        }
        return true;
    }

    /**
     * Check if zoom level is sufficient for editing
     * @returns {boolean} True if zoom is sufficient
     */
    function isZoomSufficient() {
        const currentZoom = mapGetZoom();
        if (currentZoom < CONFIG.scan.minZoomForEditing) {
            console.warn(`⚠️ Zoom in more to edit (currently ${currentZoom}, need ${CONFIG.scan.minZoomForEditing}+).`);
            return false;
        }
        return true;
    }

    /**
     * Get all RPPs currently visible in the viewport
     * @returns {Array} Array of RPP venue objects
     */
    /** Scan diagnostics switch — logs a per-scan filter breakdown when true. */
    const DEBUG_SCAN = true;
    let scanGeomErrorLogged = false;
    let scanCategoriesLogged = false;

    /**
     * Log where venues fell out of the getVisibleRPPs filter, so silent
     * failures (renamed category, dead geometry accessor) are visible.
     */
    function logScanDiagnostics(diag, visibleCount, allVenues) {
        if (!DEBUG_SCAN) {
            return;
        }
        console.log(`🔍 getVisibleRPPs: model=${diag.model}, notRPP=${diag.notRpp}, noGeom=${diag.noGeometry}, geomErr=${diag.geomError}, offscreen=${diag.offscreen} → visible=${visibleCount}`);
        if (diag.model > 0 && diag.notRpp === diag.model && !scanCategoriesLogged) {
            scanCategoriesLogged = true;
            const cats = [...new Set(allVenues.flatMap(v => v.attributes?.categories ?? []))];
            console.warn(`🔍 getVisibleRPPs: NOTHING matches category "${CONFIG.rpp.category}". Categories present in model: ${cats.join(', ') || '(none)'}`);
        }
    }

    let extentShapeLogged = false;

    /**
     * Is the venue's geometry inside the current viewport?
     * WME v2.354 changed W.map.getExtent(): it now returns a WGS84
     * [minLon, minLat, maxLon, maxLat] array, while the venue's OL geometry
     * bounds are still Web Mercator meters — the two can't be compared
     * directly (the unit mismatch made every RPP look offscreen). On the new
     * shape, convert the venue to GeoJSON via the supported
     * W.userscripts.toGeoJSONGeometry() (WGS84) and intersect lon/lat boxes.
     * Legacy builds (extent exposes intersectsBounds) keep the mercator path.
     * Anything unrecognized fails OPEN (treat as visible): the zoom guard
     * already limits the scan area, and a false "visible" only costs a no-op
     * process pass, while a false "hidden" silently disables the whole script.
     */
    function isVenueInExtent(extent, geometry) {
        if (typeof extent.intersectsBounds === 'function') {
            return extent.intersectsBounds(geometry.getBounds());
        }
        const ext = Array.isArray(extent)
            ? extent
            : [extent.left, extent.bottom, extent.right, extent.top];
        if (ext.some(n => typeof n !== 'number')) {
            return true;
        }
        const gj = W.userscripts.toGeoJSONGeometry(geometry);
        let bbox;
        if (typeof turf !== 'undefined') {
            bbox = turf.bbox(gj);
        } else if (gj.type === 'Point') {
            bbox = [gj.coordinates[0], gj.coordinates[1], gj.coordinates[0], gj.coordinates[1]];
        } else {
            return true;
        }
        return bbox[0] <= ext[2] && bbox[2] >= ext[0] && bbox[1] <= ext[3] && bbox[3] >= ext[1];
    }

    function getVisibleRPPs() {
        const extent = W.map.getExtent();
        if (!extent) {
            console.warn('getVisibleRPPs: Map extent not available');
            return [];
        }
        if (DEBUG_SCAN && !extentShapeLogged) {
            extentShapeLogged = true;
            console.log(`🔍 extent shape: ${Array.isArray(extent) ? 'array' : (extent.constructor?.name || 'object')} =`, JSON.stringify(extent));
        }

        const allVenues = W.model.venues.getObjectArray();
        const diag = { model: allVenues.length, notRpp: 0, noGeometry: 0, geomError: 0, offscreen: 0 };
        const visible = allVenues.filter(v => {
            // Must be an RPP
            if (!v.attributes?.categories?.includes(CONFIG.rpp.category)) {
                diag.notRpp++;
                return false;
            }
            // Must be within current viewport
            try {
                const geometry = v.getOLGeometry();
                if (!geometry) {
                    diag.noGeometry++;
                    return false;
                }
                if (!isVenueInExtent(extent, geometry)) {
                    diag.offscreen++;
                    return false;
                }
                return true;
            } catch (err) {
                diag.geomError++;
                if (!scanGeomErrorLogged) {
                    scanGeomErrorLogged = true;
                    console.error('🔍 getVisibleRPPs: geometry/extent check threw (first occurrence):', err);
                }
                return false;
            }
        });
        logScanDiagnostics(diag, visible.length, allVenues);
        return visible;
    }

    /**
     * Scan for RPPs and fix them
     * @param {boolean} updateUI - Whether to update the UI after scanning (default true)
     */
    function scanAndFixRPPs(updateUI = true) {
        try {
            if (!validateScanPrerequisites()) {
                return;
            }
            if (!isZoomSufficient()) {
                lastVisibleCount = 0;
                refreshRPPHighlights([]);
                if (updateUI) {
                    displayUI(0);
                }
                return;
            }

            const allRPPs = getVisibleRPPs();
            lastVisibleCount = allRPPs.length;
            if (scannerState.status === STATE.running) {
                sessionStats.totalRPPsSeen += allRPPs.length;
            }

            console.log(`Scan: ${allRPPs.length} RPPs visible, ${sessionStats.fixedVenueIds.size} already fixed`);

            if (autoFixEnabled) {
                processRPPs(allRPPs);
            }

            // After fixes, so the triangle colors reflect post-fix state.
            refreshRPPHighlights(allRPPs);

            if (updateUI) {
                displayUI(allRPPs.length);
            }
        } catch (err) {
            console.error('scanAndFixRPPs: error:', err);
            tabPaneRef.innerHTML = '<p>Error scanning RPPs.</p>';
        }
    }

    /**
     * Require a legacy WME action class, or null if WME no longer exposes it.
     * WME v2.354 removed most Waze/Action/* modules (DeleteObject, AddAlternateStreet, ...)
     * as part of the SDK migration — treat every legacy require as optional.
     * @param {string} modulePath - e.g. 'Waze/Action/UpdateObject'
     * @returns {Function|null} The action class, or null if unavailable
     */
    function requireActionClass(modulePath) {
        try {
            return require(modulePath);
        } catch {
            return null;
        }
    }

    /** One-time-per-session warning flag for the missing DeleteObject action. */
    let warnedDeleteUnavailable = false;

    /**
     * Process all RPPs for fixes
     * @param {Array} rpps - Array of RPP venue objects
     */
    function processRPPs(rpps) {
        const UpdateObject = requireActionClass('Waze/Action/UpdateObject');
        const DeleteObject = requireActionClass('Waze/Action/DeleteObject');
        if (!wmeSdk && !UpdateObject) {
            console.error('processRPPs: no SDK and no UpdateObject action — no fixes possible');
            return;
        }
        if (!wmeSdk && !DeleteObject && !warnedDeleteUnavailable) {
            warnedDeleteUnavailable = true;
            console.warn('processRPPs: no SDK and no DeleteObject action — no-address RPPs will be counted but NOT deleted');
        }
        let fixedThisScan = 0;
        let deletedThisScan = 0;

        for (const rpp of rpps) {
            const result = processRPP(rpp, UpdateObject, DeleteObject);
            if (result === 'fixed') {
                fixedThisScan++;
            }
            if (result === 'deleted') {
                deletedThisScan++;
            }
        }

        if (fixedThisScan > 0 || deletedThisScan > 0) {
            console.log(`✅ Fixed ${fixedThisScan} RPP(s), queued ${deletedThisScan} for deletion`);
        }
    }

    /**
     * Process a single RPP
     * @param {Object} rpp - RPP venue object
     * @param {Function} UpdateObject - WME UpdateObject action
     * @param {Function|null} DeleteObject - WME DeleteObject action (null when WME no longer exposes it)
     * @returns {string|null} 'fixed', 'deleted', or null
     */
    function processRPP(rpp, UpdateObject, DeleteObject) {
        const venueId = rpp.attributes.id;

        if (sessionStats.fixedVenueIds.has(venueId) || sessionStats.deletedVenueIds.has(venueId)) {
            return null;
        }

        if (hasPendingUpdateRequests(rpp)) {
            sessionStats.skippedPendingURs++;
            console.log(`⏭️  Skipping ${getStreetAddress(rpp)} [${venueId}] — has pending update requests`);
            return null;
        }

        if (!hasValidAddress(rpp)) {
            if (!wmeSdk && !DeleteObject) {
                sessionStats.skippedDeleteUnavailable++;
                return null;
            }
            if (!deleteRPP(rpp, DeleteObject)) {
                return null;
            }
            sessionStats.deletedVenueIds.add(venueId);
            sessionStats.queuedForDeletion++;
            return 'deleted';
        }

        const fixResult = attemptRPPFix(rpp, venueId, UpdateObject);
        return fixResult ? 'fixed' : null;
    }

    /**
     * Attempt to fix an RPP
     * @param {Object} rpp - RPP venue object
     * @param {string} venueId - Venue ID
     * @param {Function} UpdateObject - WME UpdateObject action
     * @returns {boolean} True if fixed
     */
    function attemptRPPFix(rpp, venueId, UpdateObject) {
        const needsEntryPoint = !rpp.attributes.entryExitPoints?.length;
        const targetLockRank = getLockRankFromLevel(targetLockLevel);
        const needsLockFix = rpp.attributes.lockRank < targetLockRank;

        // City fix runs independently; it can apply even if entry/lock are fine.
        const cityPlan = cityFixEnabled ? cityClassify(rpp) : null;
        const hasCityAction = cityPlan && (cityPlan.type === 'retarget' || cityPlan.type === 'add_alt');

        if (!needsEntryPoint && !needsLockFix && !hasCityAction) {
            return false;
        }

        const fixConfig = { rpp, needsEntryPoint, needsLockFix, targetLockRank, cityPlan };
        const fixSucceeded = fixRPP(fixConfig, UpdateObject);

        if (fixSucceeded) {
            sessionStats.fixedVenueIds.add(venueId);
            sessionStats.totalFixed++;
            if (needsEntryPoint) {
                sessionStats.entryPointsAdded++;
            }
            if (needsLockFix) {
                sessionStats.lockLevelsFixed++;
            }
            recordRecentFix(rpp);
            return true;
        }

        console.warn(`⚠️ Fix failed for RPP ${venueId}, will retry if seen again`);
        return false;
    }

    // ============================================================================
    // RPP FIX OPERATIONS
    // ============================================================================

    /**
     * Check if a venue has pending update requests (PURs).
     * WME rejects edits to venues with pending URs, so we must skip them.
     * @param {Object} venue - Venue object
     * @returns {boolean} True if there are pending update requests
     */
    function hasPendingUpdateRequests(venue) {
        const urs = venue?.attributes?.venueUpdateRequests;
        return Array.isArray(urs) && urs.length > 0;
    }

    /**
     * Check if RPP has a valid address. Only a street name qualifies — a house
     * number alone ("12" of nothing) gives no idea where the RPP belongs, so
     * those are deletion candidates, never fix/retarget candidates.
     * @param {Object} rpp - RPP venue object
     * @returns {boolean} True if has valid address
     */
    function hasValidAddress(rpp) {
        if (!rpp?.attributes) {
            return false;
        }
        return getStreetName(rpp).trim().length > 0;
    }

    /**
     * Get street name for an RPP
     * @param {Object} rpp - RPP venue object
     * @returns {string} Street name or empty string
     */
    function getStreetName(rpp) {
        if (!rpp.attributes.streetID) {
            return '';
        }
        const stObj = W.model.streets.getObjectById(rpp.attributes.streetID);
        return stObj?.attributes?.name || '';
    }

    /**
     * Delete an RPP (queue for deletion). SDK-first; legacy DeleteObject fallback.
     * @param {Object} rpp - RPP venue object
     * @param {Function|null} DeleteObject - legacy WME DeleteObject action (null when removed)
     * @returns {boolean} True if the deletion was queued
     */
    function deleteRPP(rpp, DeleteObject) {
        try {
            const address = getStreetAddress(rpp);
            if (wmeSdk) {
                wmeSdk.DataModel.Venues.deleteVenue({ venueId: String(rpp.attributes.id) });
            } else {
                W.model.actionManager.add(new DeleteObject(rpp));
            }
            console.log(`🗑️ Queued for deletion (no address): ${address}${wmeSdk ? ' (SDK)' : ''}`);
            sessionStats.pendingChanges++;
            checkPendingChangesLimit();
            return true;
        } catch (err) {
            console.error('deleteRPP: error:', err);
            return false;
        }
    }

    /**
     * Fix a single RPP using configuration object
     * @param {Object} config - Fix configuration {rpp, needsEntryPoint, needsLockFix, targetLockRank}
     * @param {Function} UpdateObject - WME UpdateObject action
     * @returns {boolean} True if fix succeeded
     */
    function fixRPP(config, UpdateObject) {
        const { rpp, needsEntryPoint, needsLockFix, targetLockRank, cityPlan } = config;

        try {
            const updateProps = {};

            if (needsEntryPoint) {
                const navPoint = createNavigationPoint(rpp);
                if (!navPoint) {
                    return false;
                }
                // Convert NavigationPoint to plain object for WME
                updateProps.entryExitPoints = [navPoint.toJSON()];
            }

            if (needsLockFix) {
                updateProps.lockRank = targetLockRank;
            }

            // City-fix: 'retarget' mutates updateProps (adds streetID); 'add_alt'
            // queues a separate segment action. Either way, applyCityFix returns
            // null/"retargeted"/"alt_queued" and handles its own stat tracking.
            const cityResult = applyCityFix(rpp, cityPlan, updateProps);

            // If there's nothing to update on the RPP itself (only an add_alt
            // was queued), skip the update — otherwise WME throws on an
            // empty props object.
            const hasRPPUpdate = Object.keys(updateProps).length > 0;

            if (hasRPPUpdate) {
                console.log('[DEBUG] Attempting fix with:', updateProps);
                if (wmeSdk) {
                    sessionStats.pendingChanges += applyRPPUpdateViaSdk(rpp, updateProps);
                } else {
                    const action = new UpdateObject(rpp, updateProps);
                    W.model.actionManager.add(action);
                    sessionStats.pendingChanges++;
                }
            }
            checkPendingChangesLimit();

            // Fix counts as successful if we made ANY change (RPP update or alt queued).
            return hasRPPUpdate || cityResult === 'alt_queued';
        } catch (err) {
            console.error('fixRPP: error:', err);
            return false;
        }
    }

    /**
     * Apply the bundled RPP update via the SDK. The legacy UpdateObject took
     * one props bag; the SDK splits it across three calls — entry points
     * (replaceNavigationPoints, safe: only invoked when the venue has none),
     * lock (updateVenue; SDK UserRank is 0-based like legacy lockRank), and
     * street retarget (updateAddress). updateProps stays in the legacy shape
     * ({entryExitPoints, lockRank, streetID}) so applyCityFix and the legacy
     * fallback keep working unchanged; the mapping happens here.
     * @param {Object} rpp - RPP venue object
     * @param {Object} updateProps - legacy-shaped props bag
     * @returns {number} Number of SDK mutations applied (each is one pending edit)
     */
    function applyRPPUpdateViaSdk(rpp, updateProps) {
        const venueId = String(rpp.attributes.id);
        const { Venues } = wmeSdk.DataModel;
        let edits = 0;
        if (updateProps.entryExitPoints) {
            Venues.replaceNavigationPoints({
                venueId,
                navigationPoints: updateProps.entryExitPoints.map(p => ({
                    point: p.point,
                    isEntry: p.entry,
                    isExit: p.exit,
                    isPrimary: p.primary,
                    name: p.name,
                })),
            });
            edits++;
        }
        if (updateProps.lockRank != null) {
            Venues.updateVenue({ venueId, lockRank: updateProps.lockRank });
            edits++;
        }
        if (updateProps.streetID != null) {
            Venues.updateAddress({ venueId, streetId: updateProps.streetID });
            edits++;
        }
        return edits;
    }

    /**
     * Create navigation point for an RPP
     * @param {Object} rpp - RPP venue object
     * @returns {NavigationPoint|null} Navigation point or null on error
     */
    function createNavigationPoint(rpp) {
        const address = getStreetAddress(rpp);

        try {
            const geometry = rpp.getOLGeometry();
            if (!geometry) {
                console.warn(`⚠️ Cannot add entry point to ${address}: geometry not loaded`);
                return null;
            }

            const point = geometry.getCentroid();
            if (!point) {
                console.warn(`⚠️ Cannot add entry point to ${address}: centroid not available`);
                return null;
            }

            const geoJSONPoint = W.userscripts.toGeoJSONGeometry(point);
            return new NavigationPoint(geoJSONPoint);
        } catch (err) {
            console.error(`❌ Failed to prepare entry point for ${address}:`, err);
            return null;
        }
    }

    /**
     * Check if pending changes limit reached and pause if needed
     */
    function checkPendingChangesLimit() {
        if (sessionStats.pendingChanges >= CONFIG.rpp.maxPendingChanges && scannerState.status === STATE.running) {
            console.warn(`⚠️ Reached ${CONFIG.rpp.maxPendingChanges} pending changes, pausing scan...`);
            pauseScanning();
            alert(`⚠️ You have ${sessionStats.pendingChanges} changes pending!\n\nWME slows down with more than 100 pending changes.\n\nPlease click Save to continue scanning.`);
        }
    }

    // ============================================================================
    // MAP VIEW FACADE — SDK-first, legacy W.map fallback
    // ============================================================================
    // WME v2.354 removed W.map.getOLExtent() (and W.map.getExtent() now returns
    // a WGS84 lon/lat array, not an OL Bounds). All auto-scan geometry runs in
    // WGS84 degrees end-to-end: extents, step sizes, and tile centers share the
    // same units, and setMapCenter takes the lon/lat the grid math produces.

    /**
     * Current viewport as a plain box {left, bottom, right, top, width, height}
     * in WGS84 degrees, or null if no extent is available.
     */
    function mapGetExtentBox() {
        let arr = null;
        try {
            if (wmeSdk) {
                arr = wmeSdk.Map.getMapExtent();
            } else {
                const e = W.map.getExtent();
                arr = Array.isArray(e) ? e : (e ? [e.left, e.bottom, e.right, e.top] : null);
            }
        } catch { /* fall through to null */ }
        if (!arr || arr.some(n => typeof n !== 'number')) {
            return null;
        }
        return {
            left: arr[0], bottom: arr[1], right: arr[2], top: arr[3],
            width: arr[2] - arr[0], height: arr[3] - arr[1],
        };
    }

    /** @returns {{lon: number, lat: number}} Current map center (WGS84) */
    function mapGetCenter() {
        return wmeSdk ? wmeSdk.Map.getMapCenter() : W.map.getCenter();
    }

    /** @returns {number} Current zoom level */
    function mapGetZoom() {
        return wmeSdk ? wmeSdk.Map.getZoomLevel() : W.map.getZoom();
    }

    /** Recenter the map (and optionally change zoom). lonLat is WGS84. */
    function mapSetCenter(lonLat, zoomLevel) {
        if (wmeSdk) {
            wmeSdk.Map.setMapCenter({ lonLat, zoomLevel });
        } else {
            W.map.setCenter(lonLat, zoomLevel);
        }
    }

    // ============================================================================
    // LAYER MANAGEMENT
    // ============================================================================

    let warnedLayerToggleUnavailable = false;

    /** Layers we hid for the auto-scan, by reference — restored on stop/pause. */
    let hiddenScanLayers = [];

    /**
     * Resolve the legacy OpenLayers map. WME v2.354 removed `W.map.olMap`, but
     * the OL map itself just moved — `W.map.getOLMap()` still returns it, and
     * it also lives at `W.map.wazeMap.olMap`. The SDK is no substitute here:
     * it has no layer enumeration (per-name visibility for nodes/segments/
     * venues only), and hiding the satellite base layer is the whole point —
     * that's what stops the imagery tile downloads during a scan.
     * @returns {Object|null} The OL map, or null if every known path is gone
     */
    function getLegacyOlMap() {
        try {
            if (typeof W.map.getOLMap === 'function') {
                return W.map.getOLMap();
            }
        } catch { /* fall through */ }
        return W.map.olMap ?? W.map.wazeMap?.olMap ?? null;
    }

    /**
     * Should this layer stay visible during the auto-scan? Keep ONLY streets
     * and RPPs (plus our own highlight triangles); everything else — satellite
     * imagery above all — is hidden to save bandwidth and render time.
     */
    function isScanKeepLayer(layer) {
        if (layer === W.map.roadLayer || layer === W.map.venueLayer) {
            return true;
        }
        const layerName = (layer.uniqueName || layer.name || '').toLowerCase();
        return layerName === 'roads' || layerName === 'venues' || layerName === HIGHLIGHT_LAYER_NAME;
    }

    /**
     * Hide every layer except streets + RPPs for the auto-scan. Tracks what it
     * hid by reference so turnLayersOn() restores exactly that set, no matter
     * how the layer list shifts mid-scan. No-op with a one-time note if the
     * OL map can't be found.
     */
    function turnLayersOff() {
        if (hiddenScanLayers.length > 0) {
            return;
        }
        const olMap = getLegacyOlMap();
        if (!olMap?.layers) {
            if (!warnedLayerToggleUnavailable) {
                warnedLayerToggleUnavailable = true;
                console.warn('turnLayersOff: OL map not found via any known path — scanning with all layers on');
            }
            return;
        }

        try {
            olMap.layers.forEach(layer => {
                try {
                    if (isScanKeepLayer(layer) || !layer.getVisibility()) {
                        return;
                    }
                    layer.setVisibility(false);
                    hiddenScanLayers.push(layer);
                } catch { /* leave this layer alone */ }
            });
            console.log(`Hid ${hiddenScanLayers.length} layers for faster scanning (kept streets + RPPs)`);
        } catch (err) {
            console.error('turnLayersOff: error:', err);
        }
    }

    /**
     * Restore the layers hidden by turnLayersOff()
     */
    function turnLayersOn() {
        if (hiddenScanLayers.length === 0) {
            return;
        }

        try {
            hiddenScanLayers.forEach(layer => {
                try {
                    layer.setVisibility(true);
                } catch { /* layer may be gone — nothing to restore */ }
            });
            console.log(`Restored ${hiddenScanLayers.length} layers`);
            hiddenScanLayers = [];
        } catch (err) {
            console.error('turnLayersOn: error:', err);
        }
    }

    // ============================================================================
    // AUTOMATIC SCANNING
    // ============================================================================

    /**
     * Reset session statistics for new scan
     */
    function resetSessionStats() {
        sessionStats.totalFixed = 0;
        sessionStats.entryPointsAdded = 0;
        sessionStats.lockLevelsFixed = 0;
        sessionStats.queuedForDeletion = 0;
        sessionStats.fixedVenueIds.clear();
        sessionStats.deletedVenueIds.clear();
        sessionStats.pendingChanges = 0;
        sessionStats.totalRPPsSeen = 0;
        sessionStats.lastScanDuration = null;
        sessionStats.recentFixes.length = 0;
        sessionStats.skippedPendingURs = 0;
        sessionStats.skippedDeleteUnavailable = 0;
        // City-fix session counters
        cityStats.retargets = 0;
        cityStats.altsQueued = 0;
        cityStats.noSegment = 0;
        cityStats.ambiguous = 0;
        cityStats.noData = 0;
        cityStats.noZip = 0;
        cityStats.skippedSegmentUR = 0;
        console.log('✓ Session statistics reset for new scan');
    }

    /**
     * Initialize scanner state for new scan
     * @param {Object} startExtent - Starting map extent
     */
    function initializeScannerState(startExtent) {
        scannerState.startExtent = startExtent;
        scannerState.startCenter = mapGetCenter();
        scannerState.startZoom = mapGetZoom();
        scannerState.startTime = Date.now();
        // status stays STOPPED until the grid is calculated (see startScanning).
        // Setting it RUNNING here causes a race: the zoom-triggered mergeend
        // would start a scan and call moveToNextScanPosition before
        // calculateScanGrid sets stepWidth, triggering an immediate stopScanning.
        scannerState.direction = 1;
        scannerState.firstStep = true;
        scannerState.currentRow = 0;
        scannerState.currentCol = 0;
        scannerState.scanningCurrentTile = false;
    }

    /**
     * Calculate scan grid parameters. Extents are mapGetExtentBox() boxes —
     * everything in WGS84 degrees, so steps and totals stay unit-consistent.
     * @param {Object} startExtent - Original map extent box
     * @param {Object} viewportExtent - Viewport extent box at scan zoom
     */
    function calculateScanGrid(startExtent, viewportExtent) {
        scannerState.stepWidth = viewportExtent.width * (1 - CONFIG.scan.overlap);
        scannerState.stepHeight = viewportExtent.height * (1 - CONFIG.scan.overlap);
        scannerState.totalCols = Math.ceil(startExtent.width / scannerState.stepWidth);
        scannerState.totalRows = Math.ceil(startExtent.height / scannerState.stepHeight);

        console.log(`Scan grid: ${scannerState.totalCols} cols × ${scannerState.totalRows} rows`);
    }

    /**
     * Set initial scan position
     * @param {Object} startExtent - Starting map extent box
     * @param {Object} viewportExtent - Viewport extent box at scan zoom
     */
    function setInitialScanPosition(startExtent, viewportExtent) {
        scannerState.nextCenter = {
            lon: startExtent.left + viewportExtent.width / 2,
            lat: startExtent.top - viewportExtent.height / 2
        };
        mapSetCenter(scannerState.nextCenter, CONFIG.scan.zoom);
    }

    /**
     * Start automatic scanning
     */
    function startScanning() {
        try {
            console.log('Starting automatic scan...');
            resetSessionStats();
            turnLayersOff();

            const startExtent = mapGetExtentBox();
            if (!startExtent) {
                console.error('startScanning: map extent unavailable — cannot start');
                turnLayersOn();
                return;
            }
            initializeScannerState(startExtent);

            mapSetCenter(scannerState.startCenter, CONFIG.scan.zoom);

            setTimeout(() => {
                const viewportExtent = mapGetExtentBox();
                if (!viewportExtent) {
                    console.error('startScanning: viewport extent unavailable — aborting');
                    stopScanning();
                    return;
                }
                calculateScanGrid(startExtent, viewportExtent);
                scannerState.status = STATE.running;
                setInitialScanPosition(startExtent, viewportExtent);
                forceUIUpdate();
            }, CONFIG.scan.zoomWaitMs);
        } catch (err) {
            console.error('startScanning: error:', err);
        }
    }

    /**
     * Calculate next position in snake pattern
     * @returns {{col: number, row: number, done: boolean}}
     */
    function calculateNextPosition() {
        let col = scannerState.currentCol + scannerState.direction;
        let row = scannerState.currentRow;

        if (col < 0 || col >= scannerState.totalCols) {
            row++;
            scannerState.direction = -scannerState.direction;
            col = scannerState.currentCol;
        }

        return { col, row, done: row >= scannerState.totalRows };
    }

    /**
     * Move to next scan position
     */
    function moveToNextScanPosition() {
        if (scannerState.status !== STATE.running) {
            return;
        }

        try {
            const s = scannerState.startExtent;
            const viewportExtent = mapGetExtentBox();

            if (!s || !viewportExtent || !scannerState.stepWidth) {
                stopScanning();
                return;
            }

            const next = calculateNextPosition();

            if (next.done) {
                completeScan();
                return;
            }

            scannerState.currentCol = next.col;
            scannerState.currentRow = next.row;

            const newCenter = calculateTileCenter(s, viewportExtent, next.col, next.row);
            scannerState.nextCenter = newCenter;

            console.log(`Scanning: row ${next.row + 1}/${scannerState.totalRows}, col ${next.col + 1}/${scannerState.totalCols}`);
            mapSetCenter(scannerState.nextCenter, CONFIG.scan.zoom);
        } catch (err) {
            console.error('moveToNextScanPosition: error:', err);
            stopScanning();
        }
    }

    /**
     * Calculate center position for a tile
     * @param {Object} startExtent - Starting extent box
     * @param {Object} viewportExtent - Viewport extent box
     * @param {number} col - Column index
     * @param {number} row - Row index
     * @returns {{lon: number, lat: number}}
     */
    function calculateTileCenter(startExtent, viewportExtent, col, row) {
        return {
            lon: startExtent.left + (col * scannerState.stepWidth) + (viewportExtent.width / 2),
            lat: startExtent.top - (row * scannerState.stepHeight) - (viewportExtent.height / 2)
        };
    }

    /**
     * Complete the scan and show results
     */
    function completeScan() {
        const scanDurationMs = Date.now() - scannerState.startTime;
        sessionStats.lastScanDuration = scanDurationMs;
        const durationStr = formatTime(scanDurationMs);

        console.log('✅ Scan complete!');
        stopScanning();
        alert(`Scan complete!\n\nScan duration: ${durationStr}\nTotal RPPs seen: ${sessionStats.totalRPPsSeen}\nRPPs fixed: ${sessionStats.totalFixed}\nRPPs queued for deletion: ${sessionStats.queuedForDeletion}\n\nDon't forget to click Save!`);
    }

    /**
     * Pause automatic scanning
     */
    function pauseScanning() {
        console.log('Pausing scan...');
        scannerState.status = STATE.paused;
        turnLayersOn();
        forceUIUpdate();
    }

    /**
     * Resume automatic scanning
     */
    function resumeScanning() {
        console.log('Resuming scan...');
        scannerState.status = STATE.running;
        turnLayersOff();
        forceUIUpdate();
        setTimeout(moveToNextScanPosition, CONFIG.scan.delayMs);
    }

    /**
     * Stop automatic scanning
     */
    function stopScanning() {
        console.log('Stopping scan...');
        turnLayersOn();

        if (scannerState.startCenter && scannerState.startZoom) {
            mapSetCenter(scannerState.startCenter, scannerState.startZoom);
        }

        resetScannerState();
        forceUIUpdate();
    }

    /**
     * Reset scanner state
     */
    function resetScannerState() {
        scannerState.status = STATE.stopped;
        scannerState.startExtent = null;
        scannerState.startCenter = null;
        scannerState.startZoom = null;
        scannerState.startTime = null;
        scannerState.scanningCurrentTile = false;
    }

    // ============================================================================
    // UI UPDATE MANAGEMENT
    // ============================================================================

    /**
     * RPP count from the most recent scan. UI re-renders triggered by events
     * that don't rescan (save complete, toggle clicks, data load) fall back to
     * this instead of stomping the sidebar's "Current view" with a stale 0.
     */
    let lastVisibleCount = 0;

    /**
     * Schedule throttled UI update
     * @param {number} [currentViewCount] - RPPs in view (defaults to last scan's count)
     */
    function scheduleUIUpdate(currentViewCount = lastVisibleCount) {
        if (uiUpdateScheduled) {
            return;
        }

        uiUpdateScheduled = true;
        uiUpdateTimeout = setTimeout(() => {
            displayUI(currentViewCount);
            uiUpdateScheduled = false;
            uiUpdateTimeout = null;
        }, CONFIG.ui.updateThrottleMs);
    }

    /**
     * Force immediate UI update
     * @param {number} [currentViewCount] - RPPs in view (defaults to last scan's count)
     */
    function forceUIUpdate(currentViewCount = lastVisibleCount) {
        if (uiUpdateTimeout) {
            clearTimeout(uiUpdateTimeout);
            uiUpdateTimeout = null;
            uiUpdateScheduled = false;
        }
        displayUI(currentViewCount);
    }

    // ============================================================================
    // UI RENDERING - SOFA Compliant Section Builders
    // ============================================================================

    /**
     * Build auto-fix status section HTML
     * @returns {string} HTML string
     */
    function buildAutoFixStatusSection() {
        const bgColor = autoFixEnabled ? '#e8f5e9' : '#ffebee';
        const borderColor = autoFixEnabled ? '#4CAF50' : '#f44336';
        const textColor = autoFixEnabled ? '#2E7D32' : '#C62828';
        const statusText = autoFixEnabled ? '✅ AUTO-FIX ENABLED' : '⏸️ AUTO-FIX PAUSED';
        const helpText = autoFixEnabled
            ? 'RPPs are being fixed automatically as you pan around.'
            : 'Auto-fix is paused. Click Resume to continue.';

        return `
            <div style="background: ${bgColor}; padding: 6px; border-radius: 4px; margin-bottom: 6px; border: 1px solid ${borderColor};">
                <p style="margin: 3px 0; font-weight: bold; color: ${textColor}; font-size: 11px;">${statusText}</p>
                <p style="margin: 3px 0; font-size: 10px; color: #666;">${helpText}</p>
            </div>
        `;
    }

    /**
     * Build lock level selector section HTML
     * @returns {string} HTML string
     */
    function buildLockLevelSection() {
        let options = '';
        for (let level = 1; level <= 6; level++) {
            const selected = (level === targetLockLevel) ? ' selected' : '';
            options += `<option value="${level}"${selected}>Level ${level}</option>`;
        }

        return `
            <div style="background: #f0f4ff; padding: 6px; border-radius: 4px; margin-bottom: 6px; border: 1px solid #5C6BC0;">
                <p style="margin: 3px 0; font-weight: bold; color: #283593; font-size: 11px;">🔒 Target Lock Level</p>
                <p style="margin: 3px 0; font-size: 10px; color: #666;">RPPs will be set to this lock level:</p>
                <select id="rpp-lock-level-select" style="padding: 4px; font-size: 11px; border-radius: 4px; border: 1px solid #5C6BC0; background: white; cursor: pointer; width: 100%; margin-top: 3px;">
                    ${options}
                </select>
            </div>
        `;
    }

    /**
     * Build zoom warning section HTML if needed
     * @returns {string} HTML string or empty
     */
    function buildZoomWarningSection() {
        const currentZoom = mapGetZoom();
        if (currentZoom >= CONFIG.scan.minZoomForEditing) {
            return '';
        }

        return `
            <div style="background: #ffebee; padding: 6px; border-radius: 4px; margin-bottom: 6px; border: 1px solid #f44336;">
                <p style="margin: 3px 0; font-weight: bold; color: #C62828; font-size: 11px;">⚠️ ZOOM IN MORE TO EDIT</p>
                <p style="margin: 3px 0; font-size: 10px; color: #666;">You are too zoomed out. Zoom in closer to the map.</p>
                <p style="margin: 3px 0; font-size: 10px; color: #666;">(Currently at zoom ${currentZoom}, need ${CONFIG.scan.minZoomForEditing}+)</p>
            </div>
        `;
    }

    /**
     * Build progress bar HTML
     * @param {number} progress - Progress percentage (0-100)
     * @returns {string} HTML string
     */
    function buildProgressBar(progress) {
        return `
            <div style="margin: 6px 0 3px 0;">
                <div style="position: relative; width: 100%; height: 18px; background: white; border: 1px solid #999; border-radius: 4px; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; height: 100%; width: ${progress}%; background: linear-gradient(90deg, #00bcd4 0%, #00acc1 100%); transition: width 0.3s ease;"></div>
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #333; font-size: 10px; text-shadow: 0 0 2px white;">${progress}%</div>
                </div>
            </div>
        `;
    }

    /**
     * Calculate scan progress
     * @returns {{tilesCompleted: number, totalTiles: number, progress: number}}
     */
    function calculateScanProgress() {
        let tilesCompletedInRow;
        if (scannerState.direction === 1) {
            tilesCompletedInRow = scannerState.currentCol;
        } else {
            tilesCompletedInRow = scannerState.totalCols - scannerState.currentCol - 1;
        }

        const tilesCompleted = (scannerState.currentRow * scannerState.totalCols) + tilesCompletedInRow;
        const totalTiles = scannerState.totalRows * scannerState.totalCols;
        const progress = ((tilesCompleted / totalTiles) * 100).toFixed(1);

        return { tilesCompleted, totalTiles, progress };
    }

    /**
     * Build scanner status section HTML if scanning
     * @returns {string} HTML string or empty
     */
    function buildScannerStatusSection() {
        if (scannerState.status === STATE.stopped) {
            return '';
        }

        const isRunning = scannerState.status === STATE.running;
        const bgColor = isRunning ? '#e3f2fd' : '#fff9e6';
        const borderColor = isRunning ? '#2196F3' : '#FFC107';
        const textColor = isRunning ? '#1976D2' : '#F57C00';
        const statusText = isRunning ? '🔄 SCANNING IN PROGRESS' : '⏸️ SCAN PAUSED';

        const { tilesCompleted, totalTiles, progress } = calculateScanProgress();

        let html = `
            <div style="background: ${bgColor}; padding: 6px; border-radius: 4px; margin-bottom: 6px; border: 1px solid ${borderColor};">
                <p style="margin: 3px 0; font-weight: bold; color: ${textColor}; font-size: 11px;">${statusText}</p>
                <p style="margin: 3px 0; font-size: 10px;">Row ${scannerState.currentRow + 1}/${scannerState.totalRows}, Col ${scannerState.currentCol + 1}/${scannerState.totalCols}</p>
                ${buildProgressBar(progress)}
        `;

        if (scannerState.startTime && tilesCompleted > 0 && isRunning) {
            const etaStr = calculateETA(tilesCompleted, totalTiles);
            html += `<p style="margin: 3px 0; font-size: 10px;">Estimated time remaining: ${etaStr}</p>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Calculate estimated time remaining
     * @param {number} tilesCompleted - Tiles completed
     * @param {number} totalTiles - Total tiles
     * @returns {string} Formatted time string
     */
    function calculateETA(tilesCompleted, totalTiles) {
        const elapsedMs = Date.now() - scannerState.startTime;
        const msPerTile = elapsedMs / tilesCompleted;
        const tilesRemaining = totalTiles - tilesCompleted;
        return formatTime(msPerTile * tilesRemaining);
    }

    /**
     * Build session statistics section HTML
     * @param {number} currentViewCount - Number of RPPs in view
     * @returns {string} HTML string
     */
    function buildSessionStatsSection(currentViewCount) {
        const pendingColor = sessionStats.pendingChanges >= CONFIG.rpp.maxPendingChanges ? '#C62828' :
            sessionStats.pendingChanges >= 80 ? '#F57C00' : '#333';
        const pendingWeight = sessionStats.pendingChanges >= 80 ? 'bold' : 'normal';

        let html = `
            <div style="background: #f0f0f0; padding: 6px; border-radius: 4px; margin-bottom: 6px;">
                <p style="margin: 3px 0; font-size: 11px;"><strong>Session Statistics:</strong></p>
                <ul style="margin: 3px 0 3px 15px; font-size: 10px; padding-left: 5px;">
                    <li>Total RPPs fixed: <strong>${sessionStats.totalFixed}</strong></li>
                    <li>Entry points added: ${sessionStats.entryPointsAdded}</li>
                    <li>Lock levels set to ${targetLockLevel}: ${sessionStats.lockLevelsFixed}</li>
                    <li style="color: #C62828;">Queued for deletion: ${sessionStats.queuedForDeletion}</li>
                    <li style="color: #F57C00;">Skipped (pending URs): ${sessionStats.skippedPendingURs}</li>
                    <li style="color: #C62828;">Skipped (delete unavailable): ${sessionStats.skippedDeleteUnavailable}</li>
                    <li style="color: ${pendingColor}; font-weight: ${pendingWeight};">Pending: ${sessionStats.pendingChanges}/${CONFIG.rpp.maxPendingChanges}</li>
                </ul>
                ${buildCityFixStatsHtml()}
                ${buildHighlightToggleHtml()}
        `;

        if (sessionStats.totalRPPsSeen > 0) {
            html += `<p style="margin: 3px 0; font-size: 10px; color: #666;"><strong>Last Scan:</strong> ${sessionStats.totalRPPsSeen} RPPs`;
            if (sessionStats.lastScanDuration !== null) {
                html += ` in ${formatTime(sessionStats.lastScanDuration)}`;
            }
            html += '</p>';
        }

        html += `<p style="margin: 3px 0; font-size: 10px; color: #666;">Current view: ${currentViewCount} RPPs</p></div>`;
        return html;
    }

    /**
     * Build the city-fix toggle + stats block. Embedded inside the session stats card.
     */
    function buildCityFixStatsHtml() {
        const loaded = !!(cityData && zctaData);
        const loadingLabel = loaded
            ? `${cityData.metadata.zip_count} ZIPs, ${zctaData.features.length} ZCTAs`
            : 'loading…';
        const toggleChecked = cityFixEnabled ? 'checked' : '';
        const showStats = cityFixEnabled && loaded;
        return `
            <div style="border-top: 1px dashed #ccc; padding-top: 6px; margin-top: 6px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
                <input type="checkbox" id="rpp-cityfix-toggle" ${toggleChecked} style="margin:0;">
                <span><strong>City fix</strong> (USPS preferred, CO only)</span>
              </label>
              <p style="margin: 2px 0 2px 20px; font-size: 10px; color:#666;">Data: ${loadingLabel}</p>
              <label style="display:flex;align-items:center;gap:6px;margin:4px 0 2px 20px;font-size:10px;color:#666;">
                <span>Max segment distance:</span>
                <input type="number" id="rpp-cityfix-maxdist" min="25" max="2000" step="25"
                       value="${cityMaxSegmentDistance}"
                       style="width:60px;padding:1px 3px;font-size:10px;">
                <span>m</span>
              </label>
              ${showStats ? `
                <ul style="margin: 3px 0 3px 15px; font-size: 10px; padding-left: 5px;">
                  <li>Retargets (streetID): <strong>${cityStats.retargets}</strong></li>
                  <li>Alt cities queued on segments: <strong>${cityStats.altsQueued}</strong></li>
                  <li style="color:#888;">Skipped — no nearby segment: ${cityStats.noSegment}</li>
                  <li style="color:#888;">Skipped — ambiguous ZIP: ${cityStats.ambiguous}</li>
                  <li style="color:#888;">Skipped — segment pending UR: ${cityStats.skippedSegmentUR}</li>
                </ul>
              ` : ''}
            </div>`;
    }

    /**
     * Build the RPP-highlight toggle block. Embedded inside the session stats
     * card, below city-fix. Turn OFF when running WMEPH so the two scripts'
     * highlight layers don't stack.
     */
    function buildHighlightToggleHtml() {
        const toggleChecked = highlightEnabled ? 'checked' : '';
        return `
            <div style="border-top: 1px dashed #ccc; padding-top: 6px; margin-top: 6px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
                <input type="checkbox" id="rpp-highlight-toggle" ${toggleChecked} style="margin:0;">
                <span><strong>Highlight RPPs</strong> (turn off when running WMEPH)</span>
              </label>
              ${highlightEnabled ? `
                <p style="margin: 2px 0 2px 20px; font-size: 10px; color:#666;">
                  <span style="color:${HIGHLIGHT_COLORS.delete};">▲ delete</span> ·
                  <span style="color:${HIGHLIGHT_COLORS.fix};">▲ needs fix</span> ·
                  <span style="color:${HIGHLIGHT_COLORS.ok};">▲ ok</span>
                </p>
              ` : ''}
            </div>`;
    }

    /**
     * Build scanner control buttons HTML
     * @returns {string} HTML string
     */
    function buildScannerControls() {
        let html = '<div style="margin: 6px 0;">';

        if (scannerState.status === STATE.stopped) {
            html += '<button id="rpp-start-scan-btn" style="padding: 6px 12px; font-size: 11px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;">🗺️ Start Auto-Scan</button>';
        } else if (scannerState.status === STATE.running) {
            html += '<button id="rpp-pause-scan-btn" style="padding: 6px 12px; font-size: 11px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;">⏸️ Pause</button>';
            html += '<button id="rpp-stop-scan-btn" style="padding: 6px 12px; font-size: 11px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">⏹️ Stop</button>';
        } else if (scannerState.status === STATE.paused) {
            html += '<button id="rpp-resume-scan-btn" style="padding: 6px 12px; font-size: 11px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;">▶️ Resume</button>';
            html += '<button id="rpp-stop-scan-btn" style="padding: 6px 12px; font-size: 11px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">⏹️ Stop</button>';
        }

        html += '</div>';
        return html;
    }

    /**
     * Build manual control buttons HTML
     * @returns {string} HTML string
     */
    function buildManualControls() {
        let html = '<div style="margin: 6px 0;">';

        if (autoFixEnabled) {
            html += '<button id="rpp-pause-btn" style="padding: 6px 12px; font-size: 11px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;">⏸️ Pause Auto-Fix</button>';
        } else {
            html += '<button id="rpp-resume-btn" style="padding: 6px 12px; font-size: 11px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;">▶️ Resume Auto-Fix</button>';
        }

        html += '<button id="rpp-reset-stats-btn" style="padding: 6px 12px; font-size: 11px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;">🔄 Reset</button>';
        html += '<button id="rpp-dump-selected-btn" style="padding: 6px 12px; font-size: 11px; background: #9C27B0; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Dump selected venue + nearby update requests to console">🔬 Dump Selected</button></div>';
        return html;
    }

    /**
     * Build instructions section HTML
     * @returns {string} HTML string
     */
    function buildInstructionsSection() {
        return `
            <div style="background: #fff9e6; padding: 6px; border-radius: 4px; margin-bottom: 6px; border-left: 3px solid #FFC107;">
                <p style="margin: 3px 0; font-weight: bold; font-size: 10px;">📋 How to use:</p>
                <ol style="margin: 3px 0 3px 15px; font-size: 9px; padding-left: 5px;">
                    <li><strong>Auto:</strong> Click "Start Auto-Scan" to scan visible area</li>
                    <li><strong>Manual:</strong> Pan around, script auto-fixes RPPs</li>
                    <li>No-address RPPs queued for deletion</li>
                    <li><strong>Click Save when done</strong></li>
                </ol>
            </div>
        `;
    }

    /**
     * Build save reminder section HTML if needed
     * @returns {string} HTML string or empty
     */
    function buildSaveReminderSection() {
        if (sessionStats.totalFixed === 0 && sessionStats.queuedForDeletion === 0) {
            return '';
        }

        return `
            <div style="background: #e3f2fd; padding: 6px; border-radius: 4px; margin-top: 6px; border-left: 3px solid #2196F3;">
                <p style="margin: 3px 0; font-weight: bold; color: #1976D2; font-size: 10px;">💾 Don't forget to SAVE!</p>
                <p style="margin: 3px 0; font-size: 9px;">${sessionStats.totalFixed} fixes + ${sessionStats.queuedForDeletion} deletions pending.</p>
            </div>
        `;
    }

    /**
     * Attach event listeners to UI buttons
     * @param {number} currentViewCount - Number of RPPs in view
     */
    function attachUIEventListeners(currentViewCount) {
        attachButtonListener('rpp-start-scan-btn', startScanning);
        attachButtonListener('rpp-pause-scan-btn', pauseScanning);
        attachButtonListener('rpp-resume-scan-btn', resumeScanning);
        attachButtonListener('rpp-stop-scan-btn', stopScanning);

        attachButtonListener('rpp-pause-btn', () => {
            autoFixEnabled = false;
            console.log('Auto-fix PAUSED');
            displayUI(currentViewCount);
        });

        attachButtonListener('rpp-resume-btn', () => {
            autoFixEnabled = true;
            console.log('Auto-fix RESUMED');
            scanAndFixRPPs();
        });

        attachButtonListener('rpp-reset-stats-btn', () => {
            if (confirm('Reset session statistics? This will not undo any fixes already made.')) {
                resetSessionStats();
                displayUI(currentViewCount);
            }
        });

        attachButtonListener('rpp-dump-selected-btn', dumpSelectedVenue);

        attachLockLevelListener(currentViewCount);
        attachRecentFixesListeners();
        attachCityFixToggleListener(currentViewCount);
        attachHighlightToggleListener(currentViewCount);
    }

    function attachCityFixToggleListener(currentViewCount) {
        const toggle = document.getElementById('rpp-cityfix-toggle');
        if (toggle) {
            toggle.addEventListener('change', (ev) => {
                cityFixEnabled = !!ev.target.checked;
                saveCityFixPreference(cityFixEnabled);
                console.log(`🏠 city-fix: ${cityFixEnabled ? 'ENABLED' : 'disabled'}`);
                displayUI(currentViewCount);
            });
        }
        const distInput = document.getElementById('rpp-cityfix-maxdist');
        if (distInput) {
            distInput.addEventListener('change', (ev) => {
                const v = Number(ev.target.value);
                if (isFinite(v) && v >= 25 && v <= 2000) {
                    cityMaxSegmentDistance = v;
                    saveCityMaxDistance(v);
                    console.log(`🏠 city-fix: max segment distance set to ${v}m`);
                } else {
                    // revert the input to the last valid value
                    ev.target.value = String(cityMaxSegmentDistance);
                }
            });
        }
    }

    function attachHighlightToggleListener(currentViewCount) {
        const toggle = document.getElementById('rpp-highlight-toggle');
        if (toggle) {
            toggle.addEventListener('change', (ev) => {
                highlightEnabled = !!ev.target.checked;
                saveHighlightPreference(highlightEnabled);
                console.log(`🏠 highlight: ${highlightEnabled ? 'ENABLED' : 'disabled'}`);
                refreshRPPHighlights(highlightEnabled ? getVisibleRPPs() : []);
                displayUI(currentViewCount);
            });
        }
    }

    /**
     * Attach click listener to a button by ID
     * @param {string} buttonId - Button element ID
     * @param {Function} handler - Click handler
     */
    function attachButtonListener(buttonId, handler) {
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.addEventListener('click', handler);
        }
    }

    /**
     * Attach change listener to lock level selector
     * @param {number} currentViewCount - Number of RPPs in view
     */
    function attachLockLevelListener(currentViewCount) {
        const lockLevelSelect = document.getElementById('rpp-lock-level-select');
        if (lockLevelSelect) {
            lockLevelSelect.addEventListener('change', (event) => {
                const newLevel = parseInt(event.target.value, 10);
                if (newLevel >= 1 && newLevel <= 6) {
                    targetLockLevel = newLevel;
                    saveLockLevelPreference(newLevel);
                    console.log(`Target lock level changed to: ${newLevel}`);
                    displayUI(currentViewCount);
                }
            });
        }
    }

    /**
     * Build and display the sidebar UI
     * @param {number} currentViewCount - Number of RPPs in view
     */
    function displayUI(currentViewCount) {
        const html = `
            <div style="padding: 8px; font-size: 11px;">
                <h2 style="font-size: 14px; margin-bottom: 8px;">🔧 RPP Auto-Fixer <span style="font-size: 10px; color: #666; font-weight: normal;">v${SCRIPT_VERSION}</span></h2>
                ${buildAutoFixStatusSection()}
                ${buildLockLevelSection()}
                ${buildZoomWarningSection()}
                ${buildScannerStatusSection()}
                ${buildSessionStatsSection(currentViewCount)}
                ${buildRecentFixesSection()}
                ${buildScannerControls()}
                ${buildManualControls()}
                ${buildInstructionsSection()}
                ${buildSaveReminderSection()}
            </div>
        `;

        tabPaneRef.innerHTML = html;
        attachUIEventListeners(currentViewCount);
    }

    // ============================================================================
    // RECENT FIXES TRACKING
    // ============================================================================

    /**
     * Get the centroid lat/lon of a venue's geometry.
     * @param {Object} venue - Venue object
     * @returns {{lat:number, lon:number}|null}
     */
    function getVenueCenterCoords(venue) {
        try {
            const geometry = venue.getOLGeometry?.();
            if (!geometry) {
                return null;
            }
            const point = geometry.getCentroid?.();
            if (!point) {
                return null;
            }
            const geoJSON = W.userscripts.toGeoJSONGeometry(point);
            return { lon: geoJSON.coordinates[0], lat: geoJSON.coordinates[1] };
        } catch (err) {
            console.error('getVenueCenterCoords: error:', err);
            return null;
        }
    }

    /**
     * Record an RPP fix attempt for the sidebar list.
     * @param {Object} rpp - RPP venue object
     */
    function recordRecentFix(rpp) {
        const address = getStreetAddress(rpp);
        const coords = getVenueCenterCoords(rpp);
        const entry = {
            venueId: rpp.attributes.id,
            address,
            lat: coords?.lat ?? null,
            lon: coords?.lon ?? null,
            timestamp: Date.now()
        };
        sessionStats.recentFixes.unshift(entry);
        if (sessionStats.recentFixes.length > MAX_RECENT_FIXES) {
            sessionStats.recentFixes.length = MAX_RECENT_FIXES;
        }
        const coordStr = (entry.lat != null && entry.lon != null)
            ? ` (${entry.lat.toFixed(6)}, ${entry.lon.toFixed(6)})`
            : '';
        console.log(`📝 Fixed: ${address}${coordStr} [${entry.venueId}]`);
    }

    /**
     * Select a venue by ID. Pans to the saved coords first so it works
     * even when the venue is no longer loaded in the model.
     * @param {string} venueId - Venue ID
     * @param {number|null} lat - Saved latitude (optional)
     * @param {number|null} lon - Saved longitude (optional)
     */
    function selectVenueById(venueId, lat, lon) {
        try {
            if (lat != null && lon != null) {
                mapSetCenter({ lon, lat }, CONFIG.scan.zoom);
            }
            const venue = W.model.venues.getObjectById(venueId);
            if (venue) {
                W.selectionManager.setSelectedModels([venue]);
                return;
            }
            if (lat == null || lon == null) {
                alert('Venue not loaded and no saved coords. Pan to its area manually.');
                return;
            }
            // Venue isn't in model yet — pan triggered tile load; select after mergeend
            const onLoad = () => {
                W.model.events.off({ mergeend: onLoad });
                const v2 = W.model.venues.getObjectById(venueId);
                if (v2) {
                    W.selectionManager.setSelectedModels([v2]);
                    console.log(`selectVenueById: selected ${venueId} after pan`);
                } else {
                    console.warn(`selectVenueById: ${venueId} still not loaded after pan — may have been deleted`);
                }
            };
            W.model.events.on({ mergeend: onLoad });
        } catch (err) {
            console.error('selectVenueById: error:', err);
        }
    }

    /**
     * Build the Recent Fixes sidebar section.
     * @returns {string} HTML string (empty if no fixes recorded yet)
     */
    function buildRecentFixesSection() {
        if (sessionStats.recentFixes.length === 0) {
            return '';
        }

        let listHtml = '';
        sessionStats.recentFixes.forEach(fix => {
            const safeAddress = fix.address.replace(/</g, '&lt;');
            const latAttr = fix.lat != null ? `data-lat="${fix.lat}"` : '';
            const lonAttr = fix.lon != null ? `data-lon="${fix.lon}"` : '';
            listHtml += `
                <li style="margin: 2px 0;">
                    <a href="#" data-venue-id="${fix.venueId}" ${latAttr} ${lonAttr} class="rpp-recent-link" style="text-decoration: none; color: #1976D2; cursor: pointer;">${safeAddress}</a>
                </li>
            `;
        });

        return `
            <div style="background: #fff3e0; padding: 6px; border-radius: 4px; margin-bottom: 6px; border-left: 3px solid #FB8C00;">
                <p style="margin: 3px 0; font-weight: bold; font-size: 11px;">🔍 Recent Fixes (newest first)</p>
                <p style="margin: 3px 0; font-size: 9px; color: #666;">Click an address to jump to that RPP. If WME rejected a save, the failing RPP is in this list.</p>
                <ul style="margin: 3px 0 3px 15px; font-size: 10px; padding-left: 5px; max-height: 200px; overflow-y: auto;">
                    ${listHtml}
                </ul>
            </div>
        `;
    }

    /**
     * Diagnostic: dump selected venue's attributes + all loaded MURs to the console.
     * Used to discover the right attribute names for "venue has pending update requests".
     */
    function dumpSelectedVenue() {
        try {
            const sel = W.selectionManager.getSelectedDataModelObjects();
            console.log('=== RPP Auto-Fixer: Dump Selected ===');
            if (!sel || sel.length === 0) {
                console.log('Nothing selected. Click an RPP first.');
                alert('Nothing selected. Click an RPP, then click Dump Selected.');
                return;
            }
            const v = sel[0];
            console.log('--- VENUE ---');
            console.log('id:', v.attributes?.id);
            console.log('type:', v.type);
            console.log('attribute keys:', Object.keys(v.attributes || {}).sort());
            console.log('full attributes:', v.attributes);

            const allMURs = W.model.mapUpdateRequests?.getObjectArray?.() || [];
            console.log(`--- mapUpdateRequests (${allMURs.length} loaded) ---`);
            if (allMURs.length > 0) {
                console.log('first MUR attribute keys:', Object.keys(allMURs[0].attributes || {}).sort());
                console.log('first MUR full:', allMURs[0].attributes);
                // Try to find a MUR pointing to this venue using common field names
                const venueId = v.attributes?.id;
                const candidateFields = ['subjectId', 'subjectIds', 'objectId', 'venueId', 'relatedId', 'targetId', 'entityId'];
                const matches = allMURs.filter(m => candidateFields.some(f => {
                    const val = m.attributes?.[f];
                    return val === venueId || (Array.isArray(val) && val.includes(venueId));
                }));
                console.log(`MURs referencing this venue (via common fields): ${matches.length}`);
                if (matches.length > 0) {
                    console.log('matches:', matches);
                }
            }
            console.log('=== Dump complete (copy console output to share) ===');
        } catch (err) {
            console.error('dumpSelectedVenue: error:', err);
        }
    }

    /**
     * Wire up click handlers for the Recent Fixes list.
     */
    function attachRecentFixesListeners() {
        document.querySelectorAll('.rpp-recent-link').forEach(a => {
            a.addEventListener('click', evt => {
                evt.preventDefault();
                const venueId = a.dataset.venueId;
                const lat = a.dataset.lat ? parseFloat(a.dataset.lat) : null;
                const lon = a.dataset.lon ? parseFloat(a.dataset.lon) : null;
                if (venueId) {
                    selectVenueById(venueId, lat, lon);
                }
            });
        });
    }

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Get formatted street address for a venue
     * @param {Object} venue - Venue object
     * @returns {string} Formatted address
     */
    function getStreetAddress(venue) {
        if (!venue?.attributes) {
            return 'No Address';
        }

        const houseNum = venue.attributes.houseNumber || '';
        const streetName = getStreetName(venue);

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
     * Format milliseconds to human-readable time
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

    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener('wme-ready', initializeScript, { once: true });
    }
})();
