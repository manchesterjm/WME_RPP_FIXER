// ==UserScript==
// @name         WME Missing Lock Rank Finder (With Green Highlight)
// @namespace    http://tampermonkey.net/
// @version      1.10.2
// @description  Find venues that are not locked to rank 3 and display a clickable list with the current lock level appended to the venue name. If the venue has externalProviderIDs, append "-E" to its name. Once a venue is fixed, the script highlights it green immediately. Additionally, venues are excluded based on category-specific lock rules: for categories SHOPPING_CENTER, CHARGING_STATION, HOSPITAL_URGENT_CARE, BUS_STATION, PARK, RIVER_STREAM, SCHOOL, SEA_LAKE_POOL, and FIRE_DEPARTMENT, exclude if locked to rank 4 (lockRank === 3); for categories STADIUM_ARENA and COLLEGE_UNIVERSITY, exclude if locked to rank 5 (lockRank === 4). Clicking a venue logs its attributes for troubleshooting.
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Sidebar tab reference
    let tabPaneRef = null;

    // Dictionary of <li> elements keyed by venueId, so we can highlight them later
    let listItemsByVenueId = {};

    // Keep track of the previously selected venue
    let oldSelection = null;

    // Categories to exclude if locked to rank 4 (lockRank === 3)
    const excludeCategoriesIfRank4 = [
        "SHOPPING_CENTER",
        "CHARGING_STATION",
        "HOSPITAL_URGENT_CARE",
        "BUS_STATION",
        "PARK",
        "RIVER_STREAM",
        "SCHOOL",
        "SEA_LAKE_POOL",
        "FIRE_DEPARTMENT"
    ];

    // Categories to exclude if locked to rank 5 (lockRank === 4)
    const excludeCategoriesIfRank5 = [
        "STADIUM_ARENA",
        "COLLEGE_UNIVERSITY"
    ];

    /***************************************************
     * 1. Initialize the script by registering a sidebar tab
     ***************************************************/
    function initializeScript() {
        try {
            console.log("Initializing Missing Lock Rank Finder script...");

            // Register a new sidebar tab
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab("missing-lock-rank");
            tabLabel.innerText = 'Lock Rank';
            tabLabel.title = 'Find Venues Not Locked to Rank 3';
            tabPane.innerHTML = '<h2>Scanning...</h2>';
            tabPaneRef = tabPane;

            // Wait until the tab pane is connected and the map data is loaded
            W.userscripts.waitForElementConnected(tabPane).then(() => {
                document.addEventListener("wme-map-data-loaded", findVenuesNotLockedToRank3);
                document.addEventListener("wme-ready", findVenuesNotLockedToRank3);
                findVenuesNotLockedToRank3();
            });

            // Listen for selection changes to highlight a venue as soon as it's fixed
            W.selectionManager.events.register("selectionchanged", null, onSelectionChanged);
        } catch (error) {
            console.error("Failed to initialize Missing Lock Rank Finder:", error);
        }
    }

    /***************************************************
     * 2. Utility to determine if a venue is "failing"
     *    (meaning it should appear in the list)
     ***************************************************/
    function isVenueFailing(v) {
        if (!v?.attributes) return false;

        // If lockRank === 2, it's locked to rank 3 => not failing
        if (v.attributes.lockRank === 2) return false;

        // If in excludeCategoriesIfRank4 but locked to rank 4 (lockRank === 3), not failing
        if (v.attributes.categories && v.attributes.categories.some(cat => excludeCategoriesIfRank4.includes(cat))) {
            if (v.attributes.lockRank === 3) return false;
        }

        // If in excludeCategoriesIfRank5 but locked to rank 5 (lockRank === 4), not failing
        if (v.attributes.categories && v.attributes.categories.some(cat => excludeCategoriesIfRank5.includes(cat))) {
            if (v.attributes.lockRank === 4) return false;
        }

        // Otherwise, it's failing
        return true;
    }

    /***************************************************
     * 3. Scan venues to find those not locked to rank 3
     ***************************************************/
    function findVenuesNotLockedToRank3() {
        try {
            if (!tabPaneRef) {
                console.error("Tab pane not available. Aborting scan.");
                return;
            }

            if (!W.model || !W.model.venues) {
                console.error("Waze data model not loaded.");
                tabPaneRef.innerHTML = '<p>Error: Waze data model not loaded.</p>';
                return;
            }

            console.log("Scanning for venues not locked to rank 3...");

            // Filter the list of failing venues
            const failingVenues = W.model.venues.getObjectArray().filter(isVenueFailing);

            console.log("Found failing venues:", failingVenues.length);
            displayFailingVenues(failingVenues);
        } catch (error) {
            console.error("Error during scanning for lock rank:", error);
            tabPaneRef.innerHTML = '<p>Error occurred while scanning.</p>';
        }
    }

    /***************************************************
     * 4. Display failing venues in the sidebar
     ***************************************************/
    function displayFailingVenues(venues) {
        listItemsByVenueId = {}; // reset dictionary

        if (!venues || venues.length === 0) {
            tabPaneRef.innerHTML = '<p>All venues appear to be locked to rank 3 (or excluded based on category rules).</p>';
            return;
        }

        tabPaneRef.innerHTML = "<ul></ul>";
        const ulElement = tabPaneRef.querySelector("ul");

        venues.forEach(venue => {
            try {
                // Determine display name
                let name = (venue.attributes.name && venue.attributes.name.trim());
                if (!name) {
                    if (venue.attributes.categories && venue.attributes.categories.includes("RESIDENCE_HOME")) {
                        name = "RPP";
                    } else if (venue.attributes.categories && venue.attributes.categories.includes("PARKING_LOT")) {
                        name = "unnamed parking lot";
                    } else {
                        name = "No Name";
                    }
                }

                // Convert the stored lockRank to the displayed lock level
                const displayLockLevel = (typeof venue.attributes.lockRank === 'number')
                    ? (venue.attributes.lockRank + 1)
                    : "unknown";

                // Check if the venue has externalProviderIDs
                const hasExternalProvider = (
                    venue.attributes.externalProviderIDs &&
                    venue.attributes.externalProviderIDs.length > 0
                );
                if (hasExternalProvider) {
                    // Append "-E" to indicate an external provider
                    name += " -E";
                }

                // Create the list item
                const listItem = document.createElement("li");
                const link = document.createElement("a");
                link.href = "#";
                link.innerText = `${name} - ${displayLockLevel}`;
                link.addEventListener("click", (event) => {
                    event.preventDefault();
                    selectVenue(venue.attributes.id);
                });

                listItem.appendChild(link);
                ulElement.appendChild(listItem);

                // Store reference so we can style it if it's fixed
                listItemsByVenueId[venue.attributes.id] = listItem;
            } catch (innerError) {
                console.error("Error processing venue:", venue, innerError);
            }
        });
    }

    /***************************************************
     * 5. Handle selection changes to highlight fixed venues
     ***************************************************/
    function onSelectionChanged() {
        try {
            // If we had an old selection, check if it's in the failing list
            if (oldSelection && listItemsByVenueId[oldSelection.attributes.id]) {
                // Re-check if the old selection is still failing
                if (!isVenueFailing(oldSelection)) {
                    // It's now fixed, so highlight it green
                    const liElem = listItemsByVenueId[oldSelection.attributes.id];
                    if (liElem) {
                        const link = liElem.querySelector("a");
                        if (link) {
                            link.style.color = "limegreen";
                            link.style.fontWeight = "bold";
                        }
                    }
                }
            }

            // Update oldSelection to the new selection
            const newSel = W.selectionManager.getSelectedDataModelObjects();
            if (newSel && newSel.length === 1 && newSel[0].type === "venue") {
                oldSelection = newSel[0];
            } else {
                oldSelection = null;
            }
        } catch (error) {
            console.error("Error in onSelectionChanged:", error);
        }
    }

    /***************************************************
     * 6. Select a venue by ID
     ***************************************************/
    function selectVenue(venueId) {
        try {
            const venue = W.model.venues.getObjectById(venueId);
            if (venue) {
                // Log the full attributes for troubleshooting
                console.log("DEBUG: Venue attributes:", venue.attributes);

                W.selectionManager.setSelectedModels([venue]);
                console.log("Selected venue:", venue.attributes.name || "No Name");
            } else {
                console.error("Venue not found:", venueId);
            }
        } catch (error) {
            console.error("Error selecting venue:", venueId, error);
        }
    }

    /***************************************************
     * 7. Initialize the script when WME is ready
     ***************************************************/
    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener("wme-ready", initializeScript, { once: true });
    }
})();
