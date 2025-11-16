// ==UserScript==
// @name         WME Parking Lot Finder 1.0.1
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Lists parking lots (including unnamed venues) so you can click and select them in the Waze Map Editor
// @author
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /*****************************
     * 1. Define Category Constants
     *****************************/
    const CAT = {
        PARKING_LOT: "PARKING_LOT"
        // Additional categories can be defined here if needed.
    };

    let tabPaneRef = null; // Reference to the custom sidebar tab

    /************************************************
     * 2. Initialize: Register Sidebar Tab
     ************************************************/
    function initializeScript() {
        try {
            console.log("Initializing Parking Lot Finder script...");
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab("parking-lot-finder");
            tabLabel.innerText = 'Parking Lots';
            tabLabel.title = 'List of Parking Lots';
            tabPane.innerHTML = '<h2>Scanning for Parking Lots...</h2>';

            tabPaneRef = tabPane;

            W.userscripts.waitForElementConnected(tabPane).then(() => {
                document.addEventListener("wme-map-data-loaded", findParkingLots);
                document.addEventListener("wme-ready", findParkingLots);
                findParkingLots();
            });
        } catch (error) {
            console.error("Failed to initialize Parking Lot Finder:", error);
        }
    }

    /************************************************
     * 3. Main Function: Find Parking Lots
     ************************************************/
    function findParkingLots() {
        try {
            if (!tabPaneRef) {
                console.error("tabPaneRef is null. Aborting scan.");
                return;
            }

            console.log("Scanning for parking lots...");
            if (!W.model || !W.model.venues) {
                console.error("W.model.venues is not available.");
                tabPaneRef.innerHTML = '<p>Error: Waze data model not loaded.</p>';
                return;
            }

            // Filter the venues so that only those recognized as parking lots are returned.
            let parkingLots = W.model.venues.getObjectArray().filter(v => {
                // Do not filter out unnamed venues; we want to include them.
                // Check for parking lot flag via categoryAttributes (if available)
                if (v.attributes.categoryAttributes && v.attributes.categoryAttributes.PARKING_LOT) {
                    return true;
                }
                // Alternatively, check if the categories array contains CAT.PARKING_LOT.
                if (v.attributes.categories && v.attributes.categories.includes(CAT.PARKING_LOT)) {
                    return true;
                }
                return false;
            });

            console.log("Total parking lots in visible map area:", parkingLots.length);
            let results = [];

            parkingLots.forEach(place => {
                try {
                    let displayName = (place.attributes.name && place.attributes.name.trim()) ? place.attributes.name : "No Name";
                    console.log("Found parking lot:", displayName);
                    console.log("Categories for", displayName, ":", place.attributes.categories);

                    let listItem = document.createElement("li");
                    let link = document.createElement("a");
                    link.href = "#";
                    link.innerText = displayName;
                    link.addEventListener("click", (event) => {
                        event.preventDefault();
                        selectVenue(place.attributes.id);
                    });

                    listItem.appendChild(link);
                    results.push(listItem);
                } catch (innerError) {
                    console.error("Error processing parking lot:", place, innerError);
                }
            });

            // Display the list of parking lots
            tabPaneRef.innerHTML = results.length > 0
                ? "<ul></ul>"
                : '<p>No parking lots found.</p>';

            if (results.length > 0) {
                let ulElement = tabPaneRef.querySelector("ul");
                results.forEach(item => ulElement.appendChild(item));
            }
        } catch (error) {
            console.error("Error during parking lot scanning:", error);
            tabPaneRef.innerHTML = '<p>Error occurred while scanning.</p>';
        }
    }

    /************************************************
     * 4. Function to Select a Venue in WME
     ************************************************/
    function selectVenue(venueId) {
        try {
            const venue = W.model.venues.getObjectById(venueId);
            if (venue) {
                W.selectionManager.setSelectedModels([venue]);
                console.log("Venue selected:", (venue.attributes.name && venue.attributes.name.trim()) ? venue.attributes.name : "No Name");
            } else {
                console.error("Venue not found:", venueId);
            }
        } catch (error) {
            console.error("Error selecting venue:", venueId, error);
        }
    }

    /************************************************
     * 5. Initialize the Script When WME is Ready
     ************************************************/
    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener("wme-ready", initializeScript, { once: true });
    }
})();
