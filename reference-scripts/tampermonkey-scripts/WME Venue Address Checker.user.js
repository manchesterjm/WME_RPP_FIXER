// ==UserScript==
// @name         WME Venue Address Checker
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  Lists venues that are missing a full address (house number and street) and highlights them green when fixed. Venues in category RESIDENCE_HOME are ignored.
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log("Script loaded: WME Venue Address Checker");

    // Global references
    let tabPaneRef = null;
    let venuesMissingAddress = [];      // Array of venues that need work
    let listItemsByVenueId = {};        // venueId -> <li> DOM element
    let oldSelection = null;            // To track the previously selected venue

    // Initialize the script
    function initializeScript() {
        console.log("initializeScript: Start");
        try {
            // Register a new sidebar tab
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab("venue-address-checker");
            tabLabel.innerText = 'Address Check';
            tabLabel.title = 'Check venues for missing full address';
            tabPane.innerHTML = '<h2>Scanning...</h2>';
            tabPaneRef = tabPane;

            // Wait for the tab to be connected
            W.userscripts.waitForElementConnected(tabPane).then(() => {
                // Listen for data load events
                document.addEventListener("wme-map-data-loaded", scanVenues);
                document.addEventListener("wme-ready", scanVenues);
                scanVenues();
            });

            // Listen for selection changes so we can highlight a venue once its address is complete
            W.selectionManager.events.register("selectionchanged", null, onSelectionChanged);

            console.log("initializeScript: Done");
        } catch (err) {
            console.error("initializeScript: error:", err);
        }
    }

    // Scan all venues (ignoring RESIDENCE_HOME) for missing address info
    function scanVenues() {
        console.log("scanVenues: scanning for venues missing house number and street...");
        try {
            if (!tabPaneRef) {
                console.error("scanVenues: tabPaneRef is null, aborting scan.");
                return;
            }
            if (!W.model || !W.model.venues) {
                console.error("scanVenues: W.model.venues not ready.");
                tabPaneRef.innerHTML = '<p>Error: WME data not ready.</p>';
                return;
            }

            const allVenues = W.model.venues.getObjectArray().filter(v => {
                return v.attributes &&
                       v.attributes.categories &&
                       !v.attributes.categories.includes("RESIDENCE_HOME");
            });
            console.log("scanVenues: total venues considered =", allVenues.length);

            venuesMissingAddress = allVenues.filter(v => !hasFullAddress(v));

            displayVenuesMissingAddress();
        } catch (err) {
            console.error("scanVenues: error:", err);
            tabPaneRef.innerHTML = '<p>Error scanning venues.</p>';
        }
    }

    // Check if a venue has a full address (house number and street name)
    function hasFullAddress(venue) {
        if (!venue || !venue.attributes) return false;
        const attrs = venue.attributes;
        // Check for house number
        if (!attrs.houseNumber || !attrs.houseNumber.trim()) return false;
        // Check for street name via streetID lookup
        let streetName = "";
        if (attrs.streetID) {
            const stObj = W.model.streets.getObjectById(attrs.streetID);
            if (stObj && stObj.attributes && stObj.attributes.name) {
                streetName = stObj.attributes.name;
            }
        }
        if (!streetName || !streetName.trim()) return false;

        return true;
    }

    // Display the list of venues missing a full address
    function displayVenuesMissingAddress() {
        console.log("displayVenuesMissingAddress: building list...");
        listItemsByVenueId = {};  // reset the dictionary

        if (venuesMissingAddress.length === 0) {
            tabPaneRef.innerHTML = "<h2>Address Check</h2><p>All venues have a full address.</p>";
            return;
        }

        // Build <ul> with each venue
        tabPaneRef.innerHTML = "<h2>Venues Missing Address</h2><ul></ul>";
        const ul = tabPaneRef.querySelector("ul");

        venuesMissingAddress.forEach(venue => {
            const name = (venue.attributes.name || "Unnamed Venue").trim();
            // Create a list item with a clickable link
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = "#";
            a.innerText = name;
            a.addEventListener("click", evt => {
                evt.preventDefault();
                console.log("Venue attributes:", venue.attributes);
                selectVenue(venue.attributes.id);
            });

            li.appendChild(a);
            ul.appendChild(li);

            // Save the list item so we can update its style later
            listItemsByVenueId[venue.attributes.id] = li;
            console.log("displayVenuesMissingAddress: added ->", name);
        });
    }

    // When the selection changes, check if the previously selected venue is now complete
    function onSelectionChanged() {
        console.log("onSelectionChanged: event fired.");

        try {
            // If we had an old selection, check if it's now complete
            if (oldSelection && listItemsByVenueId[oldSelection.attributes.id]) {
                const nowComplete = hasFullAddress(oldSelection);

                if (nowComplete) {
                    const venueName = (oldSelection.attributes.name || "Unnamed Venue").trim();
                    console.log("onSelectionChanged: Venue now has a full address:", venueName);

                    const liElem = listItemsByVenueId[oldSelection.attributes.id];
                    if (liElem) {
                        const a = liElem.querySelector("a");
                        if (a) {
                            a.style.color = "limegreen";
                            a.style.fontWeight = "bold";
                        }
                    }
                } else {
                    const venueName = (oldSelection.attributes.name || "Unnamed Venue").trim();
                    console.log("onSelectionChanged: Venue still missing address info:", venueName);
                }
            }

            // Update oldSelection to the new one (if exactly one venue is selected)
            const newSel = W.selectionManager.getSelectedDataModelObjects();
            if (newSel && newSel.length === 1 && newSel[0].type === "venue") {
                oldSelection = newSel[0];
                console.log("onSelectionChanged: new selection set to:", oldSelection.attributes.name);
            } else {
                oldSelection = null;
            }
        } catch (err) {
            console.error("onSelectionChanged: error:", err);
        }
    }

    // Select a venue by its ID
    function selectVenue(venueId) {
        console.log("selectVenue: Selecting", venueId);
        try {
            const venue = W.model.venues.getObjectById(venueId);
            if (venue) {
                W.selectionManager.setSelectedModels([venue]);
                console.log("selectVenue: selected ->", venue.attributes.name);
            } else {
                console.error("selectVenue: Venue not found:", venueId);
            }
        } catch (err) {
            console.error("selectVenue: error:", err);
        }
    }

    // Start the script when WME is ready
    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener("wme-ready", initializeScript, { once: true });
    }
})();
