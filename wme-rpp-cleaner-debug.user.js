// ==UserScript==
// @name         WME RPP Cleaner DEBUG
// @namespace    WMERPPCleaner
// @version      2.0.1-debug
// @description  Debug version - logs selection info
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

    const SCRIPT_NAME = 'WME RPP Cleaner DEBUG';
    const SCRIPT_VERSION = '2.0.1-debug';

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
        W.selectionManager.events.register('selectionchanged', null, onSelectionChanged);

        console.log(`${SCRIPT_NAME}: Initialized successfully!`);
    }

    function addSidebarTab() {
        console.log(`${SCRIPT_NAME}: Adding sidebar tab...`);

        const { tabLabel, tabPane } = W.userscripts.registerSidebarTab('rpp-cleaner-debug');

        tabLabel.innerText = '🔧 DEBUG';
        tabLabel.title = 'RPP Cleaner Debug';

        const $content = $('<div>').css({ padding: '10px', fontSize: '12px' });

        $content.append($('<h3>').text('DEBUG MODE'));
        $content.append($('<p>').text('This will show what WME returns when you select an RPP.'));

        const $cleanButton = $('<button>', {
            id: 'rpp-clean-btn',
            class: 'waze-btn waze-btn-blue',
            text: '🧹 Clean Selected RPP',
            css: { width: '100%', padding: '10px', marginTop: '10px' }
        });

        $cleanButton.click(() => {
            const venue = getSelectedVenue();
            if (venue) {
                cleanRPP(venue);
            } else {
                WazeWrap.Alerts.info(SCRIPT_NAME, 'No venue detected. Check console for debug info.');
            }
        });

        $content.append($cleanButton);

        const $debug = $('<pre>', {
            id: 'rpp-debug',
            css: {
                marginTop: '15px',
                padding: '10px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                fontSize: '10px',
                overflow: 'auto',
                maxHeight: '400px'
            }
        }).text('Select an RPP to see debug info...');

        $content.append($debug);

        tabPane.appendChild($content[0]);

        W.userscripts.waitForElementConnected(tabPane).then(() => {
            console.log(`${SCRIPT_NAME}: Tab connected`);
            updateDebugInfo();
        });

        console.log(`${SCRIPT_NAME}: Sidebar tab added!`);
    }

    function onSelectionChanged() {
        console.log(`${SCRIPT_NAME}: Selection changed, updating debug info...`);
        updateDebugInfo();
    }

    function updateDebugInfo() {
        const $debug = $('#rpp-debug');
        const $button = $('#rpp-clean-btn');

        console.log('=== SELECTION DEBUG ===');

        // Get raw selection
        const selected = W.selectionManager.getSelectedFeatures();
        console.log('selected =', selected);
        console.log('selected.length =', selected ? selected.length : 'null/undefined');

        let debugText = '=== SELECTION INFO ===\n\n';

        if (!selected || selected.length === 0) {
            debugText += 'No features selected\n';
            debugText += 'W.selectionManager.getSelectedFeatures() returned: ' + (selected ? '[]' : 'null/undefined');
            $debug.text(debugText);
            $button.prop('disabled', true);
            console.log('No selection');
            return;
        }

        debugText += `Selected features: ${selected.length}\n\n`;

        const feature = selected[0];
        console.log('feature =', feature);

        // Log everything about the feature
        debugText += '=== FEATURE OBJECT ===\n';
        debugText += `Type: ${typeof feature}\n`;
        debugText += `Constructor: ${feature.constructor?.name}\n\n`;

        // Check various ways to access the model
        debugText += '=== TRYING TO ACCESS MODEL ===\n';

        // Method 1: feature.model
        if (feature.model) {
            debugText += '✓ feature.model exists\n';
            debugText += `  Type: ${feature.model.type}\n`;
            debugText += `  Is venue: ${feature.model.type === 'venue'}\n`;
            debugText += `  Has attributes: ${!!feature.model.attributes}\n`;
            if (feature.model.attributes) {
                debugText += `  Is residential: ${feature.model.attributes.residential}\n`;
                debugText += `  Categories: ${JSON.stringify(feature.model.attributes.categories)}\n`;
            }
            console.log('feature.model =', feature.model);
        } else {
            debugText += '✗ feature.model is null/undefined\n';
        }

        // Method 2: feature.wmeModel
        if (feature.wmeModel) {
            debugText += '\n✓ feature.wmeModel exists\n';
            debugText += `  Type: ${feature.wmeModel.type}\n`;
            console.log('feature.wmeModel =', feature.wmeModel);
        } else {
            debugText += '\n✗ feature.wmeModel is null/undefined\n';
        }

        // Method 3: Direct attributes
        if (feature.attributes) {
            debugText += '\n✓ feature.attributes exists (direct)\n';
            debugText += `  Has residential: ${!!feature.attributes.residential}\n`;
            console.log('feature.attributes =', feature.attributes);
        } else {
            debugText += '\n✗ feature.attributes is null/undefined\n';
        }

        // Method 4: Check feature properties
        debugText += '\n=== FEATURE PROPERTIES ===\n';
        const props = Object.keys(feature);
        debugText += props.join(', ') + '\n';

        // Try to get venue
        const venue = getSelectedVenue();
        debugText += '\n=== VENUE DETECTION ===\n';
        if (venue) {
            debugText += '✓ getSelectedVenue() found venue\n';
            debugText += `  ID: ${venue.attributes.id}\n`;
            debugText += `  Residential: ${venue.attributes.residential}\n`;
            debugText += `  Name: "${venue.attributes.name}"\n`;
            debugText += `  Phone: ${venue.attributes.phone}\n`;
            debugText += `  URL: ${venue.attributes.url}\n`;
            $button.prop('disabled', !venue.attributes.residential);
        } else {
            debugText += '✗ getSelectedVenue() returned null\n';
            debugText += '   This is the problem!\n';
            $button.prop('disabled', true);
        }

        $debug.text(debugText);
        console.log('Debug info updated');
    }

    function getSelectedVenue() {
        const selected = W.selectionManager.getSelectedFeatures();
        console.log('getSelectedVenue: selected =', selected);

        if (!selected || selected.length === 0) {
            console.log('getSelectedVenue: No selection');
            return null;
        }

        const feature = selected[0];
        console.log('getSelectedVenue: feature =', feature);
        console.log('getSelectedVenue: feature.model =', feature.model);

        // Try different ways to get the model
        let model = null;

        // Method 1: Standard way
        if (feature.model && feature.model.type === 'venue') {
            model = feature.model;
            console.log('getSelectedVenue: Found via feature.model');
        }
        // Method 2: Try wmeModel
        else if (feature.wmeModel && feature.wmeModel.type === 'venue') {
            model = feature.wmeModel;
            console.log('getSelectedVenue: Found via feature.wmeModel');
        }
        // Method 3: Try if feature itself is the model
        else if (feature.type === 'venue') {
            model = feature;
            console.log('getSelectedVenue: Feature itself is the model');
        }
        // Method 4: Try attributes directly
        else if (feature.attributes && feature.attributes.categories) {
            model = feature;
            console.log('getSelectedVenue: Using feature directly (has attributes)');
        }

        console.log('getSelectedVenue: Final model =', model);
        return model;
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
            console.log(`${SCRIPT_NAME}: Clearing services`);
        }

        if (actions.length > 0) {
            try {
                W.model.actionManager.add(new MultiAction(actions));
                console.log(`${SCRIPT_NAME}: Successfully cleaned RPP! Changes: ${changesMade}`);

                WazeWrap.Alerts.success(
                    SCRIPT_NAME,
                    `RPP cleaned successfully!<br>Removed ${changesMade} field${changesMade !== 1 ? 's' : ''}.`,
                    false,
                    false,
                    5000
                );

                setTimeout(() => updateDebugInfo(), 100);
            } catch (error) {
                console.error(`${SCRIPT_NAME}: Error cleaning RPP:`, error);
                WazeWrap.Alerts.error(SCRIPT_NAME, `Error: ${error.message}`);
            }
        } else {
            console.log(`${SCRIPT_NAME}: RPP is already clean`);
            WazeWrap.Alerts.info(SCRIPT_NAME, 'This RPP is already clean.');
            updateDebugInfo();
        }
    }

    function bootstrap() {
        if (typeof W === 'object' &&
            W.userscripts?.state.isReady &&
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
