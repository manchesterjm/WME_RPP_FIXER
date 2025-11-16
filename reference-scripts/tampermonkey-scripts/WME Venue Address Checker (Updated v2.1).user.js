// ==UserScript==
// @name         WME Venue Address Checker (Updated v2.1)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Lists venues missing a full address (house number, streetID, and city). Uses harmonizer functions (with manual fallback) to derive the city.
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @grant        none
// @require      https://greasyfork.org/en/scripts/28689-wme-place-harmonizer-beta/code/WME%20Place%20Harmonizer%20Beta.user.js
// ==/UserScript==

(function () {
    'use strict';

    console.log("Script loaded: WME Venue Address Checker (Updated v2.1)");

    // Global references
    let tabPaneRef = null;
    let venuesMissingAddress = [];      // Array of venues that need work
    let listItemsByVenueId = {};        // venueId -> <li> DOM element
    let oldSelection = null;            // To track the previously selected venue

    // Helper: Get the computed city using harmonizer (with manual fallback)
    function getComputedCity(venue) {
        let addr;
        if (typeof WMEPlaceHarmonizer !== "undefined" &&
            typeof WMEPlaceHarmonizer.getAddress === "function") {
            addr = WMEPlaceHarmonizer.getAddress(venue);
        } else {
            addr = venue.getAddress(W.model);
        }
        let computedCity = "";
        if (addr && addr.city && typeof addr.city.hasName === 'function' && addr.city.hasName()) {
            computedCity = addr.city.getName();
        }
        if (!computedCity && venue.attributes.streetID) {
            const stObj = W.model.streets.getObjectById(venue.attributes.streetID);
            if (stObj?.attributes?.cityID) {
                const cityObj = W.model.cities.getObjectById(stObj.attributes.cityID);
                if (cityObj?.attributes?.name) {
                    computedCity = cityObj.attributes.name;
                }
            }
        }
        return computedCity;
    }

    // Updated hasFullAddress: check for non-empty house number, a streetID, and a computed city.
    function hasFullAddress(venue) {
        if (!venue || !venue.attributes) return false;

        if (!venue.attributes.houseNumber || !venue.attributes.houseNumber.trim()) {
            console.log("hasFullAddress: missing house number for", venue.attributes.name);
            return false;
        }
        if (!venue.attributes.streetID) {
            console.log("hasFullAddress: missing streetID for", venue.attributes.name);
            return false;
        }
        const city = getComputedCity(venue);
        if (!city || !city.trim()) {
            console.log("hasFullAddress: missing city for", venue.attributes.name);
            return false;
        }
        return true;
    }

    // Initialize the script.
    function initializeScript() {
        console.log("initializeScript: Start");
        try {
            // Register a new sidebar tab.
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab("venue-address-checker");
            tabLabel.innerText = 'Address Check';
            tabLabel.title = 'Check venues for missing full address';
            tabPane.innerHTML = '<h2>Scanning...</h2>';
            tabPaneRef = tabPane;

            // Wait for the tab to be connected.
            W.userscripts.waitForElementConnected(tabPane).then(() => {
                // Listen for data load events.
                document.addEventListener("wme-map-data-loaded", scanVenues);
                document.addEventListener("wme-ready", scanVenues);
                scanVenues();
            });

            // Listen for selection changes to update the list.
            W.selectionManager.events.register("selectionchanged", null, onSelectionChanged);

            console.log("initializeScript: Done");
        } catch (err) {
            console.error("initializeScript: error:", err);
        }
    }

    // Scan all venues (ignoring RESIDENCE_HOME) for missing address info.
    function scanVenues() {
        console.log("scanVenues: scanning for venues missing house number, streetID, or city...");
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

    // Display the list of venues missing a full address.
    function displayVenuesMissingAddress() {
        console.log("displayVenuesMissingAddress: building list...");
        listItemsByVenueId = {};  // reset the dictionary

        if (venuesMissingAddress.length === 0) {
            tabPaneRef.innerHTML = "<h2>Address Check</h2><p>All venues have a full address.</p>";
            return;
        }

        // Build a list (<ul>) of venues.
        tabPaneRef.innerHTML = "<h2>Venues Missing Address</h2><ul></ul>";
        const ul = tabPaneRef.querySelector("ul");

        venuesMissingAddress.forEach(venue => {
            const name = (venue.attributes.name || "Unnamed Venue").trim();
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
            listItemsByVenueId[venue.attributes.id] = li;
            console.log("displayVenuesMissingAddress: added ->", name);
        });
    }

    // Update the style for venues that become complete.
    function onSelectionChanged() {
        console.log("onSelectionChanged: event fired.");
        try {
            if (oldSelection && listItemsByVenueId[oldSelection.attributes.id]) {
                const nowComplete = hasFullAddress(oldSelection);
                const venueName = (oldSelection.attributes.name || "Unnamed Venue").trim();
                if (nowComplete) {
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
                    console.log("onSelectionChanged: Venue still missing address info:", venueName);
                }
            }
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

    // Select a venue by its ID.
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

    // Start the script when WME is ready.
    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener("wme-ready", initializeScript, { once: true });
    }
})();
