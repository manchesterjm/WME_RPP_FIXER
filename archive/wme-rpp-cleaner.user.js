// ==UserScript==
// @name         WME RPP Cleaner
// @namespace    WMERPPCleaner
// @version      1.0.0
// @description  Cleans residential place points (RPPs) by removing personal information
// @author       Your Name
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @grant        none
// @license      MIT
// ==/UserScript==

/* global W */
/* global WazeWrap */

(function() {
    'use strict';

    // Script constants
    const SCRIPT_NAME = 'WME RPP Cleaner';
    const SCRIPT_VERSION = '1.0.0';

    // WME Action classes (will be initialized later)
    let UpdateObject;
    let MultiAction;

    // Initialize the script
    function init() {
        console.log(`${SCRIPT_NAME} v${SCRIPT_VERSION}: Initializing...`);

        // Import WME action classes with fallback for compatibility
        if (typeof require !== 'undefined') {
            UpdateObject = require('Waze/Action/UpdateObject');
            MultiAction = require('Waze/Action/MultiAction');
        } else {
            UpdateObject = W.Action.UpdateObject;
            MultiAction = W.Action.MultiAction;
        }

        // Add UI elements
        addCleanButton();
        addKeyboardShortcut();

        // Add to WazeWrap for update notifications
        WazeWrap.Interface.ShowScriptUpdate(
            SCRIPT_NAME,
            SCRIPT_VERSION,
            '',  // Update message (empty for first release)
            'https://greasyfork.org/scripts/XXXXX'  // Update when published
        );

        console.log(`${SCRIPT_NAME}: Initialized successfully!`);
    }

    // Add a button to the edit panel
    function addCleanButton() {
        // Create the button
        const $button = $('<button>', {
            class: 'waze-btn waze-btn-blue',
            css: {
                margin: '5px',
                padding: '8px 12px',
                fontSize: '14px'
            },
            text: '🧹 Clean RPP',
            title: 'Clean selected residential place point (removes personal info)'
        });

        // Click handler
        $button.click(function() {
            const venue = getSelectedVenue();
            if (venue) {
                cleanRPP(venue);
            } else {
                WazeWrap.Alerts.info(SCRIPT_NAME, 'Please select a residential place point first.');
            }
        });

        // Add button to the venue panel
        // We'll check for venue panel existence and add it there
        const checkInterval = setInterval(() => {
            const $venuePanel = $('#edit-panel .venue-edit-general');
            if ($venuePanel.length > 0) {
                // Check if button already exists
                if ($('.wme-rpp-cleaner-btn').length === 0) {
                    const $container = $('<div>', {
                        class: 'wme-rpp-cleaner-btn',
                        css: {
                            padding: '10px',
                            borderTop: '1px solid #e0e0e0',
                            borderBottom: '1px solid #e0e0e0',
                            backgroundColor: '#f9f9f9',
                            textAlign: 'center'
                        }
                    });
                    $container.append($button);
                    $venuePanel.prepend($container);
                }
                clearInterval(checkInterval);
            }
        }, 500);

        // Also listen for selection changes to show/hide button
        W.selectionManager.events.register('selectionchanged', null, updateButtonVisibility);
    }

    // Update button visibility based on selection
    function updateButtonVisibility() {
        const venue = getSelectedVenue();
        const $button = $('.wme-rpp-cleaner-btn');

        if (venue && venue.attributes.residential) {
            $button.show();
        } else {
            $button.hide();
        }
    }

    // Add keyboard shortcut
    function addKeyboardShortcut() {
        // Add to WME's keyboard shortcuts
        const shortcutName = 'rppCleaner';

        // Register in I18n for keyboard shortcuts panel
        if (!W.accelerators.Groups.rppCleaner) {
            W.accelerators.Groups.rppCleaner = [];
            W.accelerators.Groups.rppCleaner.members = [];
        }

        // Add action
        W.accelerators.addAction(shortcutName, { group: 'rppCleaner' });
        W.accelerators.events.register(shortcutName, null, () => {
            const venue = getSelectedVenue();
            if (venue && venue.attributes.residential) {
                cleanRPP(venue);
            }
        });

        // Register default shortcut (Alt+Shift+C for Clean)
        W.accelerators._registerShortcuts({
            rppCleanerShortcut: shortcutName
        });

        console.log(`${SCRIPT_NAME}: Keyboard shortcut registered (Alt+Shift+C)`);
    }

    // Get currently selected venue
    function getSelectedVenue() {
        const selected = W.selectionManager.getSelectedFeatures();
        if (selected && selected.length > 0) {
            const feature = selected[0];
            if (feature.model && feature.model.type === 'venue') {
                return feature.model;
            }
        }
        return null;
    }

    // Main RPP cleaning function
    function cleanRPP(venue) {
        console.log(`${SCRIPT_NAME}: Starting clean for venue ID ${venue.attributes.id}`);

        // Verify it's actually an RPP
        if (!venue.attributes.residential) {
            WazeWrap.Alerts.error(SCRIPT_NAME, 'This is not a residential place point!');
            return;
        }

        // Collect all the changes we need to make
        const actions = [];
        let changesMade = 0;

        // Clear name if it has one
        if (venue.attributes.name && venue.attributes.name !== '') {
            actions.push(new UpdateObject(venue, { name: '' }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing name: "${venue.attributes.name}"`);
        }

        // Clear description
        if (venue.attributes.description !== null && venue.attributes.description !== '') {
            actions.push(new UpdateObject(venue, { description: null }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing description`);
        }

        // Clear phone
        if (venue.attributes.phone !== null && venue.attributes.phone !== '') {
            actions.push(new UpdateObject(venue, { phone: null }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing phone: "${venue.attributes.phone}"`);
        }

        // Clear URL
        if (venue.attributes.url !== null && venue.attributes.url !== '') {
            actions.push(new UpdateObject(venue, { url: null }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing URL: "${venue.attributes.url}"`);
        }

        // Clear services
        if (venue.attributes.services && venue.attributes.services.length > 0) {
            actions.push(new UpdateObject(venue, { services: [] }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing services: ${venue.attributes.services.join(', ')}`);
        }

        // Execute all changes as a single action (one undo/redo step)
        if (actions.length > 0) {
            try {
                W.model.actionManager.add(new MultiAction(actions));
                console.log(`${SCRIPT_NAME}: Successfully cleaned RPP! Changes: ${changesMade}`);

                WazeWrap.Alerts.success(
                    SCRIPT_NAME,
                    `RPP cleaned successfully!<br>Removed ${changesMade} field${changesMade !== 1 ? 's' : ''}.`
                );
            } catch (error) {
                console.error(`${SCRIPT_NAME}: Error cleaning RPP:`, error);
                WazeWrap.Alerts.error(SCRIPT_NAME, `Error cleaning RPP: ${error.message}`);
            }
        } else {
            console.log(`${SCRIPT_NAME}: RPP is already clean`);
            WazeWrap.Alerts.info(SCRIPT_NAME, 'This RPP is already clean - no changes needed.');
        }
    }

    // Wait for WME and WazeWrap to be ready
    function bootstrap() {
        if (typeof W === 'object' &&
            W.userscripts?.state.isReady &&
            WazeWrap &&
            WazeWrap.Ready) {
            init();
        } else {
            console.log(`${SCRIPT_NAME}: Waiting for WME...`);
            setTimeout(bootstrap, 200);
        }
    }

    // Start the script
    console.log(`${SCRIPT_NAME}: Loading...`);
    bootstrap();

})();
