// ==UserScript==
// @name               WME Layer Saver
// @author             HBiede
// @namespace          hbiede.com
// @description        Save the state of different combinations of layer display settings.settings
// @include            /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor.*$/
// @require            https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @version            2023.03.28.002
// @grant              none
// @copyright          2023 HBiede
// @downloadURL https://update.greasyfork.org/scripts/383384/WME%20Layer%20Saver.user.js
// @updateURL https://update.greasyfork.org/scripts/383384/WME%20Layer%20Saver.meta.js
// ==/UserScript==

/* global GM_info */
/* global W */
/* global WazeWrap */
/* global require */
/* global $ */
/* global localStorage */
/* global document */
/* global alert */
/* global prompt */
/* global window */

const DEBUG = true;
const UPDATE_DESCRIPTION = "<h4 style='margin-bottom: 5px;'>Bug Fixes:</h4><ul><li>Fix tab rendering</li></ul>";
const DEFAULT_SETTINGS = { settings: [] };
const SCRIPT_STRING = 'LSaver';
const LAYER_SELECTION_TYPES = 'wz-toggle-switch,wz-checkbox';
const LAYER_CONTAINER = 'layer-switcher-region';
const settings = DEFAULT_SETTINGS;


// clear the alert text
function setAlertParagraph(message) {
    if (typeof message === 'string') document.getElementById('LSaverAlertText').innerText = message;
}

// load the settings.settings from the local and server sources
async function loadSettings() {
    let local;
    try {
        local = JSON.parse(localStorage.getItem(SCRIPT_STRING));
    } catch (e) {
        local = DEFAULT_SETTINGS;
    }
    try {
        const returnValue = $.extend(DEFAULT_SETTINGS, local);

        const serverSettings = await WazeWrap.Remote.RetrieveSettings(SCRIPT_STRING);
        if (serverSettings && serverSettings.time > returnValue.time) {
            $.extend(returnValue, serverSettings);
        }
        return returnValue;
    } catch (e) {
        if (DEBUG) console.log(`${e.message}`);
        return DEFAULT_SETTINGS;
    }
}

// save settings.settings locally/to the server
function saveSettings() {
    settings.time = Date.now();
    WazeWrap.Remote.SaveSettings(SCRIPT_STRING, settings);
    localStorage.setItem(SCRIPT_STRING, JSON.stringify(settings));
}

// load all the settings.settings groups
async function loadLayerSaverSettings() {
    const returnValue = await loadSettings(SCRIPT_STRING);
    if (DEBUG) console.log(returnValue);
    settings.settings = returnValue.settings;
    saveSettings(SCRIPT_STRING);
    console.log(await WazeWrap.Remote.RetrieveSettings(SCRIPT_STRING));
}

// save all the settings groups
function saveLayerSaverSettings() {
    let arrayBuilder = [];
    const currentSettings = document.getElementById('LSaverSelector').children;
    for (let i = 0; i < currentSettings.length; i++) {
        arrayBuilder = arrayBuilder.concat([`${currentSettings[i].textContent}::${currentSettings[i].settingsString}`]);
        console.log(`${currentSettings[i].textContent}`);
    }
    settings.settings = arrayBuilder;
    console.log(settings.settings);
    saveSettings(SCRIPT_STRING);
}

// load the selected settings.settings group
function loadLayerSettings() {
	const settingsString = document.getElementById('LSaverSelector').selectedOptions[0].settingsString;
	if (DEBUG) console.log(`Loading according to: ${settingsString}`);
	const toggles = document.getElementById(LAYER_CONTAINER).querySelectorAll(LAYER_SELECTION_TYPES);
	for (let i = 0; i < toggles.length; i++) {
		// if the input is in the group and not checked, or not in the group and checked, click the input
		if ((toggles[i].id && settingsString.includes(toggles[i].id)) !== toggles[i].checked) {
			if (DEBUG) console.log(`Toggling ${toggles[i].id}`);
			toggles[i].click();
		}
	}
	console.log(`Loaded Group: ${document.getElementById('LSaverSelector').selectedOptions[0].textContent}`);
}

// delete the selected settings.settings group
function deleteLayerSettings() {
	const name = document.getElementById('LSaverSelector').children[document.getElementById('LSaverSelector').selectedIndex].textContent;
	document.getElementById('LSaverSelector').children[document.getElementById('LSaverSelector').selectedIndex].remove();
	saveLayerSaverSettings();
	console.log(`Deleted Group: ${name}`);
}

// turn the currently selected inputs into a usable string
function getCurrentLayerSettingsString() {
    const toggles = document.getElementById(LAYER_CONTAINER).querySelectorAll(LAYER_SELECTION_TYPES);
    let stringBuilder = '';
    for (let i = 0; i < toggles.length; i++) {
        if (toggles[i].checked) {
            stringBuilder += toggles[i].id;
        }
    }
    if (DEBUG) console.log(stringBuilder);
    return stringBuilder;
}

// save the selected settings.settings group
function saveLayerSettings() {
    const layerSettingSelector = document.createElement('option');
    layerSettingSelector.textContent = prompt('Name Your New Layer Settings Group', '');
    if (layerSettingSelector.textContent != null) {
        layerSettingSelector.settingsString = getCurrentLayerSettingsString();
        document.getElementById('LSaverSelector').appendChild(layerSettingSelector);
        saveLayerSaverSettings();
        console.log(`Created Group: ${layerSettingSelector.textContent}`);
        return;
    }
    console.log('Save Aborted');
}

function populateSelector() {
    // build the selector options
    if (settings.settings.length > 0) {
        for (let i = 0; i < settings.settings.length; i++) {
            const setting = settings.settings[i].split('::');
            const layerSettingSelector = document.createElement('option');
            [layerSettingSelector.textContent] = setting;
            [layerSettingSelector.value] = setting;
            layerSettingSelector.settingsString = setting[1] ? setting[1] : '';
            document.getElementById('LSaverSelector').appendChild(layerSettingSelector);
        }
    }
}

// build the selector on the script tab
function selectorInit() {
    console.log('Loading Layer Settings');
    populateSelector();

    // add button listeners
    document.getElementById('LSaverLoadBtn').addEventListener('click', () => { loadLayerSettings(); });
    document.getElementById('LSaverDeleteBtn').addEventListener('click', () => { deleteLayerSettings(); });
    document.getElementById('LSaverSaveBtn').addEventListener('click', () => { saveLayerSettings(); });
    document.getElementById('LSaverSetDefaultBtn').addEventListener('click', () => {
    	document.getElementById('LSaverSelector').add(document.getElementById('LSaverSelector').children[document.getElementById('LSaverSelector').selectedIndex], 0);
    	saveLayerSaverSettings();
    });
    document.getElementById('LSaverImportBtn').addEventListener('click', () => { importSettingsString(); });
    document.getElementById('LSaverExportBtn').addEventListener('click', () => { exportSettingsString(); });
    document.getElementById('LSaverExportAllBtn').addEventListener('click', () => { exportAllSettingsString(); });
    console.log('Layer Settings Loaded');
}

// import a settings array in the from of a base64 encoded stringified version of the settings array
function importSettingsString() {
    try {
	    const settingsString = window.atob(prompt('Import settings text:', ''));
        if (settingsString) {
	        const importedArray = JSON.parse();
            if (!Array.isArray(importedArray)) {
                setAlertParagraph('Invalid Input String');
                return;
            }
            settings.settings = settings.settings.concat(importedArray);
            saveSettings('LSaver');

            const selector = document.getElementById('LSaverSelector');
            while (selector.firstChild) {
                selector.removeChild(selector.firstChild);
            }
            populateSelector();

            setAlertParagraph('Loaded');
	    }
    } catch (e) {
        setAlertParagraph(e.message);
    }
}

function copyToClipboard(text) {
    if (text === '') {
        setAlertParagraph('Cannot export no settings.');
        return;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setAlertParagraph("Copied all groups' settings text to clipboard");
}

// export the selected settings string
function exportSettingsString() {
    const selectedSetting = document.getElementById('LSaverSelector').selectedOptions[0];
    if (selectedSetting) {
        copyToClipboard(window.btoa(JSON.stringify([`${selectedSetting.textContent}::${selectedSetting.settingsString}`])));
    } else {
        setAlertParagraph('Select a group');
    }
}

// export a settings array in the from of a base64 encoded stringified version of the settings array
function exportAllSettingsString() {
    copyToClipboard(window.btoa(JSON.stringify(settings.settings)));
}

// Create the tab in the sidebar via WazeWrap
function createTab() {
    const tabDisplay = $('<div>', { id: 'WMELayerSaver' });
    tabDisplay.html([
        '<h3><b>WME Layer Saver</b></h3>',
        `<p><i>${GM_info.script.version} by ${GM_info.script.author}</i></p>`,
        '<div id="LSaverSelectorDiv"><label>Groups</label><br><select id="LSaverSelector" style="width:90%; margin-bottom: 8px;"></select></div>',
        '<div id="LSaverInteractionDiv"></div>',
        '<button class="btn btn-primary" id="LSaverLoadBtn" title="Load" style="margin: 8px 8px auto auto;">Load</button>',
        '<button class="btn btn-primary" id="LSaverDeleteBtn" title="Delete Selected" style="margin: 8px 8px auto auto;">Delete Selected</button><br>',
        '<button class="btn btn-primary" id="LSaverSaveBtn" title="Save New Group" style="margin: 8px 8px auto auto;">Save New Group</button><br>',
        '<button class="btn btn-primary" id="LSaverSetDefaultBtn" title="Set As Default" style="margin: 8px 8px auto auto;">Set As Default</button><br>',
        '<button class="btn btn-primary" id="LSaverImportBtn" title="Import" style="margin: 8px 8px auto auto;">Import</button>',
        '<button class="btn btn-primary" id="LSaverExportBtn" title="Export" style="margin: 8px 8px auto auto;">Export</button>',
        '<button class="btn btn-primary" id="LSaverExportAllBtn" title="Export All" style="margin: 8px 8px auto auto;">Export All</button>',
        '<p style="padding-top: 10px; font-weight: bold;" id="LSaverAlertText"></p>',
        '</div>'
    ].join(''));

    WazeWrap.Interface.Tab(SCRIPT_STRING, tabDisplay.html(), selectorInit, 'Layer Saver');
    if (DEBUG) console.log(tabDisplay);
}

// main function
async function initLayerSaver(attempts = 1) {
    if (attempts <= 1000) {
        if (!WazeWrap.Ready || typeof W === 'undefined' || typeof W.map === 'undefined' || typeof W.loginManager === 'undefined' || !document.getElementById(LAYER_CONTAINER)) {
            if (DEBUG) console.log('Layer Saver: retry');
            setTimeout(() => {
                initLayerSaver(attempts++);
            }, 800);
        } else {
            console.log('Starting Layer Saver');
            await loadLayerSaverSettings();
            createTab();
            WazeWrap.Interface.ShowScriptUpdate(GM_info.script.name, GM_info.script.version, UPDATE_DESCRIPTION, 'https://greasyfork.org/en/scripts/383384-wme-layer-saver', 'https://www.waze.com/forum/viewtopic.php?f=819&t=283513');
        }
    }
}

// start
setTimeout(initLayerSaver, 1000);
