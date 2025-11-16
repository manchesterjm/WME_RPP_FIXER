// ==UserScript==
// @name         WME RPP Cleaner v2
// @namespace    WMERPPCleaner
// @version      2.0.0
// @description  Cleans residential place points (RPPs) by removing personal information
// @author       Your Name
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @grant        none
// @license      MIT
// ==/UserScript==

/* global W */
/* global WazeWrap */
/* global $ */

(function() {
    'use strict';

    // Script constants
    const SCRIPT_NAME = 'WME RPP Cleaner';
    const SCRIPT_VERSION = '2.0.0';

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

        // Add sidebar tab with button
        addSidebarTab();

        // Add keyboard shortcut
        addKeyboardShortcut();

        // Listen for venue selection changes to update button state
        W.selectionManager.events.register('selectionchanged', null, onSelectionChanged);

        console.log(`${SCRIPT_NAME}: Initialized successfully!`);
    }

    // Add a sidebar tab with the clean button
    function addSidebarTab() {
        console.log(`${SCRIPT_NAME}: Adding sidebar tab...`);

        try {
            // Use WME's userscripts API to register a sidebar tab
            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab('rpp-cleaner');

            tabLabel.innerText = '🧹 RPP';
            tabLabel.title = 'RPP Cleaner - Clean residential place points';

            // Build the tab content
            const $content = $('<div>').css({
                padding: '10px'
            });

            // Add header
            $content.append($('<h3>').text('RPP Cleaner'));

            // Add description
            $content.append($('<p>').html(
                'Select a residential place point (RPP) and click Clean to remove all personal information.'
            ));

            // Add the clean button
            const $cleanButton = $('<button>', {
                id: 'rpp-clean-btn',
                class: 'waze-btn waze-btn-blue',
                text: '🧹 Clean Selected RPP',
                css: {
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    marginTop: '10px'
                }
            });

            $cleanButton.click(() => {
                const venue = getSelectedVenue();
                if (venue) {
                    cleanRPP(venue);
                } else {
                    WazeWrap.Alerts.info(SCRIPT_NAME, 'Please select a residential place point first.');
                }
            });

            $content.append($cleanButton);

            // Add status area
            const $status = $('<div>', {
                id: 'rpp-status',
                css: {
                    marginTop: '15px',
                    padding: '10px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px',
                    fontSize: '12px'
                }
            }).html('<em>No RPP selected</em>');

            $content.append($status);

            // Add instructions
            $content.append($('<hr>').css('margin', '15px 0'));
            $content.append($('<p>').html(
                '<strong>Keyboard Shortcut:</strong> Alt+Shift+C<br>' +
                '<strong>What it cleans:</strong> Name, Phone, URL, Description, Services'
            ));

            tabPane.appendChild($content[0]);

            // Update status when tab is shown
            W.userscripts.waitForElementConnected(tabPane).then(() => {
                console.log(`${SCRIPT_NAME}: Tab connected, updating status...`);
                updateStatus();
            });

            console.log(`${SCRIPT_NAME}: Sidebar tab added successfully!`);
        } catch (error) {
            console.error(`${SCRIPT_NAME}: Error adding sidebar tab:`, error);
        }
    }

    // Update the status display
    function updateStatus() {
        const $status = $('#rpp-status');
        const $button = $('#rpp-clean-btn');
        const venue = getSelectedVenue();

        if (!venue) {
            $status.html('<em>No venue selected</em>');
            $button.prop('disabled', true);
            return;
        }

        if (!venue.attributes.residential) {
            $status.html('<em>Selected venue is not an RPP</em>');
            $button.prop('disabled', true);
            return;
        }

        // It's an RPP - check what needs cleaning
        const issues = [];
        if (venue.attributes.name && venue.attributes.name !== '') {
            issues.push(`Name: "${venue.attributes.name}"`);
        }
        if (venue.attributes.phone) {
            issues.push(`Phone: ${venue.attributes.phone}`);
        }
        if (venue.attributes.url) {
            issues.push(`URL: ${venue.attributes.url}`);
        }
        if (venue.attributes.description) {
            issues.push('Description present');
        }
        if (venue.attributes.services && venue.attributes.services.length > 0) {
            issues.push(`Services: ${venue.attributes.services.length}`);
        }

        if (issues.length === 0) {
            $status.html('<strong style="color: green;">✓ RPP is clean!</strong>');
            $button.prop('disabled', true);
        } else {
            $status.html(
                '<strong style="color: orange;">⚠ RPP needs cleaning</strong><br>' +
                `<small>${issues.join('<br>')}</small>`
            );
            $button.prop('disabled', false);
        }
    }

    // Handle selection changes
    function onSelectionChanged() {
        updateStatus();
    }

    // Add keyboard shortcut
    function addKeyboardShortcut() {
        console.log(`${SCRIPT_NAME}: Adding keyboard shortcut...`);

        // Simple keyboard listener
        document.addEventListener('keydown', (e) => {
            // Alt+Shift+C
            if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                e.stopPropagation();

                const venue = getSelectedVenue();
                if (venue && venue.attributes.residential) {
                    console.log(`${SCRIPT_NAME}: Keyboard shortcut triggered`);
                    cleanRPP(venue);
                } else {
                    console.log(`${SCRIPT_NAME}: Keyboard shortcut pressed but no RPP selected`);
                }
            }
        }, true);  // Use capture phase

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
                    `RPP cleaned successfully!<br>Removed ${changesMade} field${changesMade !== 1 ? 's' : ''}.`,
                    false,
                    false,
                    5000  // Show for 5 seconds
                );

                // Update status after cleaning
                setTimeout(() => updateStatus(), 100);
            } catch (error) {
                console.error(`${SCRIPT_NAME}: Error cleaning RPP:`, error);
                WazeWrap.Alerts.error(SCRIPT_NAME, `Error cleaning RPP: ${error.message}`);
            }
        } else {
            console.log(`${SCRIPT_NAME}: RPP is already clean`);
            WazeWrap.Alerts.info(SCRIPT_NAME, 'This RPP is already clean - no changes needed.');
            updateStatus();
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
