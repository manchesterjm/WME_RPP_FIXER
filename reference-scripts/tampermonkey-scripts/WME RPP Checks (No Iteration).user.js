// ==UserScript==
// @name         WME RPP Checks (No Iteration)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Scans all RPPs for missing entry/exit or lock rank mismatch, displays them, and highlights them green immediately when fixed (without auto-iteration).
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log("Script loaded: WME RPP Checks (No Iteration)");

    // 1. Global references
    let tabPaneRef = null;
    let failingResidences = [];         // List of RPPs that need work
    let listItemsByVenueId = {};        // venueId -> <li> DOM element
    let oldSelection = null;            // Keep track of the previously selected RPP for immediate check

    // 2. Initialize the script
    function initializeScript() {
        console.log("initializeScript: Start");
        try {
            // Register a new sidebar tab
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab("rpp-checks-no-iteration");
            tabLabel.innerText = 'RPP Check';
            tabLabel.title = 'Check RPPs for Missing Entry/Exit or Lock Rank Mismatch';
            tabPane.innerHTML = '<h2>Scanning...</h2>';
            tabPaneRef = tabPane;

            // Wait for the tab to be connected
            W.userscripts.waitForElementConnected(tabPane).then(() => {
                // Listen for data load
                document.addEventListener("wme-map-data-loaded", scanResidences);
                document.addEventListener("wme-ready", scanResidences);
                scanResidences();
            });

            // Listen for selection changes so we can highlight an RPP as soon as it's fixed
            W.selectionManager.events.register("selectionchanged", null, onSelectionChanged);

            console.log("initializeScript: Done");
        } catch (err) {
            console.error("initializeScript: error:", err);
        }
    }

    // 3. Scan for failing residences
    function scanResidences() {
        console.log("scanResidences: scanning for RPPs...");
        try {
            if (!tabPaneRef) {
                console.error("scanResidences: tabPaneRef is null, abort.");
                return;
            }
            if (!W.model || !W.model.venues) {
                console.error("scanResidences: W.model.venues not ready.");
                tabPaneRef.innerHTML = '<p>Error: WME data not ready.</p>';
                return;
            }

            // Find all RPPs
            const allRPPs = W.model.venues.getObjectArray().filter(v => {
                return v.attributes &&
                       v.attributes.categories &&
                       v.attributes.categories.includes("RESIDENCE_HOME");
            });

            console.log("scanResidences: total RPPs found =", allRPPs.length);

            // Check each for missing E/E or lock rank mismatch
            failingResidences = [];
            allRPPs.forEach(rpp => {
                const missing = !hasEntryExit(rpp);
                const wrongRank = (rpp.attributes.lockRank !== 2);
                if (missing || wrongRank) {
                    failingResidences.push({ venue: rpp, missing, wrongRank });
                }
            });

            displayFailingResidences();
        } catch (err) {
            console.error("scanResidences: error:", err);
            tabPaneRef.innerHTML = '<p>Error scanning RPPs.</p>';
        }
    }

    // 4. Check if an RPP has entry/exit
    function hasEntryExit(rpp) {
        return rpp.attributes.entryExitPoints &&
               Array.isArray(rpp.attributes.entryExitPoints) &&
               rpp.attributes.entryExitPoints.length > 0;
    }

    // 5. Display the failing RPPs
    function displayFailingResidences() {
        console.log("displayFailingResidences: building list...");
        listItemsByVenueId = {};  // reset the dictionary

        if (failingResidences.length === 0) {
            tabPaneRef.innerHTML = "<h2>RPP Check</h2><p>All residences OK or locked rank 3.</p>";
            return;
        }

        // Build <ul> with each failing RPP
        tabPaneRef.innerHTML = "<h2>Residences Needing Work</h2><ul></ul>";
        const ul = tabPaneRef.querySelector("ul");

        failingResidences.forEach(item => {
            const rpp = item.venue;
            const addr = getStreetAddress(rpp);
            // Build suffix
            let suffix = "";
            if (item.missing && item.wrongRank) suffix = " - RP";
            else if (item.missing) suffix = " - P";
            else if (item.wrongRank) suffix = " - R";

            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = "#";
            a.innerText = addr + suffix;
            a.addEventListener("click", evt => {
                evt.preventDefault();
                // Log all the attributes of the venue to the console
                console.log("Venue attributes:", rpp.attributes);
                selectVenue(rpp.attributes.id);
            });

            li.appendChild(a);
            ul.appendChild(li);

            // Store in dictionary so we can highlight it if it's fixed
            listItemsByVenueId[rpp.attributes.id] = li;
            console.log("displayFailingResidences: added ->", addr + suffix);
        });
    }

    // 6. Build an address string
    function getStreetAddress(venue) {
        if (!venue || !venue.attributes) return "No Address";
        const houseNum = venue.attributes.houseNumber || "";
        let streetName = "";
        if (venue.attributes.streetID) {
            const stObj = W.model.streets.getObjectById(venue.attributes.streetID);
            if (stObj && stObj.attributes && stObj.attributes.name) {
                streetName = stObj.attributes.name;
            }
        }
        let parts = [];
        if (houseNum.trim()) parts.push(houseNum.trim());
        if (streetName.trim()) parts.push(streetName.trim());
        const combined = parts.join(" ");
        return combined || "No Address";
    }

    // 7. When the selection changes, see if the old RPP is now fixed
    function onSelectionChanged() {
        console.log("onSelectionChanged: fired.");

        try {
            // If we had an old selection, check if it's in the failing list
            if (oldSelection && listItemsByVenueId[oldSelection.attributes.id]) {
                const stillMissing = !hasEntryExit(oldSelection);
                const stillWrongRank = (oldSelection.attributes.lockRank !== 2);

                if (!stillMissing && !stillWrongRank) {
                    // It's now fixed, so highlight it green
                    const address = getStreetAddress(oldSelection);
                    console.log("onSelectionChanged: The old RPP is now fixed:", address);

                    const liElem = listItemsByVenueId[oldSelection.attributes.id];
                    if (liElem) {
                        // style the <a> child to be limegreen
                        const a = liElem.querySelector("a");
                        if (a) {
                            a.style.color = "limegreen";
                            a.style.fontWeight = "bold";
                        }
                    }
                } else {
                    // It's still failing
                    const address = getStreetAddress(oldSelection);
                    console.log("onSelectionChanged: The old RPP still needs work:", address);
                }
            }

            // Update oldSelection to the new one
            const newSel = W.selectionManager.getSelectedDataModelObjects();
            if (newSel && newSel.length === 1 && newSel[0].type === "venue") {
                oldSelection = newSel[0];
                console.log("onSelectionChanged: new oldSelection =", getStreetAddress(oldSelection));
            } else {
                oldSelection = null;
            }
        } catch (err) {
            console.error("onSelectionChanged: error:", err);
        }
    }

    // 8. Select a venue by ID
    function selectVenue(venueId) {
        console.log("selectVenue: Selecting", venueId);
        try {
            const venue = W.model.venues.getObjectById(venueId);
            if (venue) {
                W.selectionManager.setSelectedModels([venue]);
                console.log("selectVenue: selected ->", getStreetAddress(venue));
            } else {
                console.error("selectVenue: not found:", venueId);
            }
        } catch (err) {
            console.error("selectVenue: error:", err);
        }
    }

    // 9. Start the script when WME is ready
    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener("wme-ready", initializeScript, { once: true });
    }
})();
