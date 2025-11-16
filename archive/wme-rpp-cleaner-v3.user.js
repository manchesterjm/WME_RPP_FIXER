// ==UserScript==
// @name         WME RPP Cleaner v3
// @namespace    WMERPPCleaner
// @version      3.0.0
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

    const SCRIPT_NAME = 'WME RPP Cleaner';
    const SCRIPT_VERSION = '3.0.0';

    let UpdateObject;
    let MultiAction;

    function init() {
        console.log(`${SCRIPT_NAME} v${SCRIPT_VERSION}: Initializing...`);

        if (typeof require !== 'undefined') {
            UpdateObject = require('Waze/Action/UpdateObject');
            MultiAction = require('Waze/Action/MultiAction');
        } else {
            UpdateObject = W.Action.UpdateObject;
            MultiAction = W.Action.MultiAction;
        }

        addSidebarTab();
        document.addEventListener('keydown', onKeyDown, true);
        W.selectionManager.events.register('selectionchanged', null, onSelectionChanged);

        console.log(`${SCRIPT_NAME}: Initialized successfully!`);
    }

    function addSidebarTab() {
        console.log(`${SCRIPT_NAME}: Adding sidebar tab...`);

        const { tabLabel, tabPane } = W.userscripts.registerSidebarTab('rpp-cleaner');

        tabLabel.innerText = '🧹 RPP';
        tabLabel.title = 'RPP Cleaner';

        const $content = $('<div>').css({ padding: '10px' });

        $content.append($('<h3>').text('RPP Cleaner'));
        $content.append($('<p>').html(
            'Select a residential place point (RPP) and click Clean to remove all personal information.'
        ));

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
        $content.append($('<hr>').css('margin', '15px 0'));
        $content.append($('<p>').html(
            '<strong>Keyboard:</strong> Alt+Shift+C<br>' +
            '<strong>Clears:</strong> Name, Phone, URL, Description, Services'
        ));

        tabPane.appendChild($content[0]);

        W.userscripts.waitForElementConnected(tabPane).then(() => {
            console.log(`${SCRIPT_NAME}: Tab connected`);
            updateStatus();
        });

        console.log(`${SCRIPT_NAME}: Tab added!`);
    }

    function onSelectionChanged() {
        updateStatus();
    }

    function onKeyDown(e) {
        if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            e.stopPropagation();

            const venue = getSelectedVenue();
            if (venue && venue.attributes.residential) {
                console.log(`${SCRIPT_NAME}: Keyboard shortcut triggered`);
                cleanRPP(venue);
            }
        }
    }

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

    function getSelectedVenue() {
        // Get the selected features
        const selected = W.selectionManager.getSelectedFeatures();

        if (!selected || selected.length === 0) {
            return null;
        }

        const feature = selected[0];

        // In modern WME, the feature object has the data but not the model
        // We need to get the actual venue model from W.model.venues
        if (feature.featureType === 'venue' || feature.type === 'venue') {
            // Get the venue ID
            const venueId = feature.id;

            if (!venueId) {
                console.error(`${SCRIPT_NAME}: Feature has no ID`);
                return null;
            }

            // Get the actual venue model from W.model.venues
            const venue = W.model.venues.getObjectById(venueId);

            if (venue) {
                console.log(`${SCRIPT_NAME}: Found venue model via ID:`, venueId);
                return venue;
            } else {
                console.error(`${SCRIPT_NAME}: Could not find venue in W.model.venues for ID:`, venueId);
                return null;
            }
        }

        // Fallback: try the old way (for compatibility)
        if (feature.model && feature.model.type === 'venue') {
            console.log(`${SCRIPT_NAME}: Found venue via feature.model (old method)`);
            return feature.model;
        }

        return null;
    }

    function cleanRPP(venue) {
        console.log(`${SCRIPT_NAME}: Starting clean for venue ID ${venue.attributes.id}`);

        if (!venue.attributes.residential) {
            WazeWrap.Alerts.error(SCRIPT_NAME, 'This is not a residential place point!');
            return;
        }

        const actions = [];
        let changesMade = 0;

        if (venue.attributes.name && venue.attributes.name !== '') {
            actions.push(new UpdateObject(venue, { name: '' }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing name: "${venue.attributes.name}"`);
        }

        if (venue.attributes.description !== null && venue.attributes.description !== '') {
            actions.push(new UpdateObject(venue, { description: null }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing description`);
        }

        if (venue.attributes.phone !== null && venue.attributes.phone !== '') {
            actions.push(new UpdateObject(venue, { phone: null }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing phone: "${venue.attributes.phone}"`);
        }

        if (venue.attributes.url !== null && venue.attributes.url !== '') {
            actions.push(new UpdateObject(venue, { url: null }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing URL: "${venue.attributes.url}"`);
        }

        if (venue.attributes.services && venue.attributes.services.length > 0) {
            actions.push(new UpdateObject(venue, { services: [] }));
            changesMade++;
            console.log(`${SCRIPT_NAME}: Clearing services: ${venue.attributes.services.join(', ')}`);
        }

        if (actions.length > 0) {
            try {
                W.model.actionManager.add(new MultiAction(actions));
                console.log(`${SCRIPT_NAME}: Successfully cleaned RPP! Changes: ${changesMade}`);

                WazeWrap.Alerts.success(
                    SCRIPT_NAME,
                    `✅ RPP cleaned!<br>Removed ${changesMade} field${changesMade !== 1 ? 's' : ''}.`,
                    false,
                    false,
                    5000
                );

                setTimeout(() => updateStatus(), 100);
            } catch (error) {
                console.error(`${SCRIPT_NAME}: Error cleaning RPP:`, error);
                WazeWrap.Alerts.error(SCRIPT_NAME, `Error: ${error.message}`);
            }
        } else {
            console.log(`${SCRIPT_NAME}: RPP is already clean`);
            WazeWrap.Alerts.info(SCRIPT_NAME, '✓ This RPP is already clean!');
            updateStatus();
        }
    }

    function bootstrap() {
        if (typeof W === 'object' &&
            W.userscripts?.state.isReady &&
            W.model?.venues &&
            WazeWrap &&
            WazeWrap.Ready) {
            init();
        } else {
            setTimeout(bootstrap, 200);
        }
    }

    console.log(`${SCRIPT_NAME}: Loading...`);
    bootstrap();

})();
