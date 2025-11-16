// ==UserScript==
// @name         WME Missing Customer Parking Finder 3.8.5
// @namespace    http://tampermonkey.net/
// @version      3.8.5
// @description  Find places without customer parking checked and auto-iterate on button click. If a venue’s name is missing or empty, it displays as “No Name”.
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
        PLA: "PARKING_LOT",
        RPP: "RESIDENCE_HOME"
        // Additional categories can be defined here.
    };

    /****************************************************************
     * 2. List of Categories to Ignore (Using Constants Where Possible)
     ****************************************************************/
    const CATS_TO_IGNORE = [
        1, 2, 3, 4, 5, 6, 18, 31,
        CAT.PLA, CAT.RPP
    ];

    let tabPaneRef = null; // Reference to the custom sidebar tab

    /************************************************
     * 3. Script Initialization: Register Sidebar Tab
     ************************************************/
    function initializeScript() {
        try {
            console.log("Initializing Missing Customer Parking script...");
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab("missing-customer-parking");
            tabLabel.innerText = 'No Parking';
            tabLabel.title = 'Find Places Without Customer Parking';
            tabPane.innerHTML = '<h2>Scanning...</h2>';

            tabPaneRef = tabPane;

            W.userscripts.waitForElementConnected(tabPane).then(() => {
                document.addEventListener("wme-map-data-loaded", findPlacesWithoutCustomerParking);
                document.addEventListener("wme-ready", findPlacesWithoutCustomerParking);
                findPlacesWithoutCustomerParking();
            });
        } catch (error) {
            console.error("Failed to initialize script:", error);
        }
    }

    /************************************************
     * 4. Main Function: Find Places Missing Parking
     ************************************************/
    function findPlacesWithoutCustomerParking() {
        try {
            if (!tabPaneRef) {
                console.error("tabPaneRef is null. Aborting scan.");
                return;
            }

            console.log("Scanning for places without customer parking...");
            if (!W.model || !W.model.venues) {
                console.error("W.model.venues is not available.");
                tabPaneRef.innerHTML = '<p>Error: Waze data model not loaded.</p>';
                return;
            }

            // Filter venues by pending updates, customer parking status, and category rules.
            let places = W.model.venues.getObjectArray().filter(v => {
                // Log basic details for debugging.
                console.log(
                    "Inspecting venue:",
                    v.attributes.id,
                    v.attributes.name ? v.attributes.name.trim() : "No Name",
                    "Attribute keys:", Object.keys(v.attributes)
                );

                // Skip venues with pending update requests.
                if (v.attributes.venueUpdateRequests && v.attributes.venueUpdateRequests.length > 0) {
                    console.log("Skipping venue", v.attributes.id, "due to venueUpdateRequests:", v.attributes.venueUpdateRequests);
                    return false;
                }

                // Skip venues that already have customer parking checked.
                if (v.attributes.services.includes("PARKING_FOR_CUSTOMERS")) {
                    return false;
                }
                // Require that the venue has at least one category.
                if (!v.attributes.categories || v.attributes.categories.length === 0) {
                    return false;
                }
                // If the first category is one we ignore, skip.
                if (CATS_TO_IGNORE.includes(v.attributes.categories[0])) {
                    return false;
                }
                // Skip if the venue’s categoryAttributes flag it as a parking lot.
                if (v.attributes.categoryAttributes && v.attributes.categoryAttributes.PARKING_LOT) {
                    return false;
                }
                // Also skip if any category includes PARKING_LOT.
                if (v.attributes.categories.includes(CAT.PLA)) {
                    return false;
                }
                return true;
            });

            console.log("Total valid places in visible map area:", places.length);
            let results = [];

            places.forEach(place => {
                try {
                    // Use "No Name" if the name property is missing or blank.
                    let displayName = (place.attributes.name && place.attributes.name.trim()) ? place.attributes.name : "No Name";
                    console.log("Checking place:", displayName);
                    console.table(place.attributes.services);
                    console.log("Venue categories for", displayName, ":", place.attributes.categories);

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
                    console.error("Error processing place:", place, innerError);
                }
            });

            // Display the list of venues
            tabPaneRef.innerHTML = results.length > 0
                ? "<ul></ul>"
                : '<p>No places found without customer parking.</p>';

            if (results.length > 0) {
                let ulElement = tabPaneRef.querySelector("ul");
                results.forEach(item => ulElement.appendChild(item));

                // Add a button to start auto-iteration
                let startButton = document.createElement("button");
                startButton.innerText = "Start Auto Iteration";
                startButton.style.marginTop = "10px";
                startButton.addEventListener("click", () => {
                    startButton.disabled = true;
                    autoIterateVenues(places);
                });
                tabPaneRef.appendChild(startButton);
            }
        } catch (error) {
            console.error("Error during scanning:", error);
            tabPaneRef.innerHTML = '<p>Error occurred while scanning.</p>';
        }
    }

    /**************************************************
     * 5. Auto-Iteration: Select Venues One by One
     **************************************************/
    async function autoIterateVenues(venues) {
        console.log("Starting auto-iteration through venues...");
        for (let venue of venues) {
            let displayName = (venue.attributes.name && venue.attributes.name.trim()) ? venue.attributes.name : "No Name";
            console.log("Auto selecting venue:", displayName);
            selectVenue(venue.attributes.id);
            await new Promise(resolve => setTimeout(resolve, 600)); // 600 ms delay
        }
        console.log("Finished auto iteration through all venues.");
    }

    /********************************************************
     * 6. Select Venue and Automatically Check the Parking Box
     ********************************************************/
    function selectVenue(venueId) {
        try {
            const venue = W.model.venues.getObjectById(venueId);
            if (venue) {
                W.selectionManager.setSelectedModels([venue]);
                let displayName = (venue.attributes.name && venue.attributes.name.trim()) ? venue.attributes.name : "No Name";
                console.log("Venue selected:", displayName);
                // Automatically check the customer parking checkbox
                clickCustomerParkingCheckbox();
            } else {
                console.error("Venue not found:", venueId);
            }
        } catch (error) {
            console.error("Error selecting venue:", venueId, error);
        }
    }

    function clickCustomerParkingCheckbox() {
        setTimeout(() => {
            let checkbox = document.querySelector('input[type="checkbox"][name="services"][value="PARKING_FOR_CUSTOMERS"]');
            if (checkbox) {
                if (!checkbox.checked) {
                    checkbox.click();
                    console.log("Customer parking checkbox has been automatically clicked.");
                } else {
                    console.log("Customer parking checkbox is already checked.");
                }
            } else {
                console.log("Customer parking checkbox not found.");
            }
        }, 100); // 100 ms delay
    }

    /********************************************************
     * 7. Initialize the Script When WME is Ready
     ********************************************************/
    if (W?.userscripts?.state.isReady) {
        initializeScript();
    } else {
        document.addEventListener("wme-ready", initializeScript, { once: true });
    }
})();
