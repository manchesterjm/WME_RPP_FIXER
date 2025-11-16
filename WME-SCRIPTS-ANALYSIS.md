# WME Scripts - Comparative Analysis

## Overview

This document analyzes 8 popular WME UserScripts to understand common patterns, techniques, and best practices for WME script development.

**Scripts Analyzed:**
1. WME Place Harmonizer (wme.txt) - 561KB
2. WME Fix UI Memorial Edition - 210KB
3. WME GIS Layers - 270KB
4. WME HN NavPoints - 56KB
5. WME Norm Name - 54KB
6. WME Place Interface Enhancements - 263KB
7. WME Quick HN - 12KB
8. WME SpeedHelper - 167KB
9. WME WazeBar - 75KB

---

## 1. Initialization Patterns

### Pattern A: WazeWrap.Ready (Most Common)

Used by: **Norm Name**, **Place Harmonizer**

```javascript
function bootstrap() {
    if (W && W.loginManager && WazeWrap && WazeWrap.Ready) {
        init();
    } else {
        setTimeout(bootstrap, 100);
    }
}
bootstrap();
```

**Pros:**
- Simple and reliable
- Uses WazeWrap library which most scripts already require
- Ensures W object is fully loaded

**Cons:**
- Requires WazeWrap dependency
- Polling can be inefficient

---

### Pattern B: Modern SDK Bootstrap

Used by: **GIS Layers**

```javascript
const sdk = await bootstrap(
    {
        id: 'wme-gis-layers',
        name: SCRIPT_NAME,
        version: GM_info.script.version
    },
    {
        dependenciesLoaded: () => true  // Check if dependencies ready
    }
);
```

**Pros:**
- Modern async/await pattern
- Built-in script update monitoring
- More structured initialization
- Better error handling

**Cons:**
- Requires bootstrap library
- More complex setup

---

### Pattern C: Direct Check with Promise

Used by: **Place Harmonizer**

```javascript
function waitForReady() {
    return new Promise(resolve => {
        function loop() {
            if (typeof W === 'object' && W.userscripts?.state.isReady && WazeWrap?.Ready) {
                resolve();
            } else {
                setTimeout(loop, 100);
            }
        }
        loop();
    });
}

async function init() {
    await waitForReady();
    // Your code here
}
```

**Pros:**
- Modern Promise-based approach
- Clean async/await usage
- No external dependencies beyond WazeWrap

**Cons:**
- Still uses polling
- Requires ES6+ support

---

## 2. Importing WME Action Classes

### Pattern A: require() with Fallback (Most Robust)

Used by: **Norm Name**, **Place Interface Enhancements**

```javascript
var UpdateObject, MultiAction;

if (typeof(require) !== "undefined") {
    UpdateObject = require("Waze/Action/UpdateObject");
    MultiAction = require("Waze/Action/MultiAction");
} else {
    UpdateObject = W.Action.UpdateObject;
    MultiAction = W.Action.MultiAction;
}
```

**Why this is best:**
- Works in both old and new WME versions
- Handles changes in WME architecture
- Defensive programming

---

### Pattern B: Direct require()

Used by: **Place Harmonizer**

```javascript
MultiAction = require('Waze/Action/MultiAction');
UpdateObject = require('Waze/Action/UpdateObject');
UpdateFeatureGeometry = require('Waze/Action/UpdateFeatureGeometry');
UpdateFeatureAddress = require('Waze/Action/UpdateFeatureAddress');
OpeningHour = require('Waze/Model/Objects/OpeningHour');
```

**When to use:**
- Modern WME versions only
- When you're confident require() is available

---

### Pattern C: Inline require()

Used by: **Place Interface Enhancements** (for rare actions)

```javascript
W.model.actionManager.add(
    new(require("Waze/Action/UpdatePlaceUpdate"))(ven, pur, approve)
);
```

**When to use:**
- For actions used only once or twice
- Keeps global scope cleaner
- Good for specialized actions

---

## 3. Making Updates to WME Objects

### ✅ CORRECT Pattern: Always Use actionManager

All scripts follow this pattern:

```javascript
// Single update
W.model.actionManager.add(new UpdateObject(venue, { name: 'New Name' }));

// Multiple updates (PREFERRED for RPPs and complex changes)
const actions = [];
actions.push(new UpdateObject(venue, { name: '' }));
actions.push(new UpdateObject(venue, { phone: null }));
actions.push(new UpdateObject(venue, { url: null }));
W.model.actionManager.add(new MultiAction(actions));
```

**Critical Rules:**
1. **NEVER** directly modify `venue.attributes.name = 'foo'` ❌
2. **ALWAYS** use `UpdateObject` ✅
3. **ALWAYS** wrap in `actionManager.add()` ✅
4. **ALWAYS** use `MultiAction` for multiple changes ✅

---

### Example: WME Norm Name (Segments)

```javascript
// Update street name on segment
W.model.actionManager.add(
    new UpdateObject(segment, {
        primaryStreetID: newStreetID,
        separator: false
    })
);
```

---

### Example: Place Interface Enhancements (Venues)

```javascript
// Delete image from venue
let UpdateObject = require("Waze/Action/UpdateObject");
let newimages = [].concat(venue.attributes.images);  // Clone array!
for(let i = newimages.length-1; i >= 0; i--) {
    if(newimages[i].id === imageID)
        newimages.splice(i, 1);
}
W.model.actionManager.add(new UpdateObject(venue, {images: newimages}));
```

**Key Technique:** Always clone arrays before modifying!

---

### Example: Place Harmonizer (Complex Updates)

```javascript
const actions = [];

// Clear RPP attributes
if (venue.attributes.residential) {
    if (venue.attributes.name !== '') {
        actions.push(new UpdateObject(venue, { name: '' }));
    }
    if (venue.attributes.description) {
        actions.push(new UpdateObject(venue, { description: null }));
    }
    if (venue.attributes.phone) {
        actions.push(new UpdateObject(venue, { phone: null }));
    }
    if (venue.attributes.url) {
        actions.push(new UpdateObject(venue, { url: null }));
    }
    if (venue.attributes.services.length > 0) {
        actions.push(new UpdateObject(venue, { services: [] }));
    }
}

// Execute all at once
if (actions.length > 0) {
    W.model.actionManager.add(new MultiAction(actions));
}
```

**This is the exact pattern for RPP cleaning!**

---

## 4. Geometry Updates

### Pattern: UpdateFeatureGeometry

Used by: **Place Interface Enhancements**

```javascript
let UFG = require("Waze/Action/UpdateFeatureGeometry");

// Move or reshape venue
W.model.actionManager.add(
    new UFG(
        selected,                                              // venue
        W.model.venues,                                        // collection
        W.userscripts.toGeoJSONGeometry(originalGeometry),    // old geometry
        W.userscripts.toGeoJSONGeometry(newGeometry)          // new geometry
    )
);
```

**Key Points:**
- Must convert OpenLayers geometry to GeoJSON
- Requires both old and new geometry
- Pass the collection (W.model.venues)

---

## 5. Address Updates

### Pattern: UpdateFeatureAddress

Used by: **Place Interface Enhancements**

```javascript
let UpdateFeatureAddress = require('Waze/Action/UpdateFeatureAddress');
let address = closestSegment.getAddress();

let newAttributes = {
    streetID: address.attributes.street.id,
    cityID: address.attributes.city.id,
    stateID: address.attributes.state.id,
    countryID: address.attributes.country.id,
    emptyStreet: address.attributes.street == null
};

multiaction.doSubAction(W.model, new UpdateFeatureAddress(newPlace, newAttributes));
```

**Note:** Address updates are more complex than simple attribute updates.

---

## 6. Creating New Places

### Pattern: AddLandmark (AddPlace)

Used by: **Place Interface Enhancements**

```javascript
let AddPlace = require("Waze/Action/AddLandmark");

let NewPlace = new W.model.venues.Venue({
    geoJSONGeometry: W.userscripts.toGeoJSONGeometry(geometry),
    venueType: "POINT",
    categories: ["GAS_STATION"]
});

W.model.actionManager.add(new AddPlace(NewPlace));
```

---

## 7. MultiAction Advanced Usage

### Pattern: doSubAction

Used by: **Place Interface Enhancements**

```javascript
let multiaction = new MultiAction();

// Add multiple sub-actions
multiaction.doSubAction(W.model, new UpdateObject(obj, {aliases}));
multiaction.doSubAction(W.model, new UpdateObject(obj, {name: newName}));

// Execute all at once
W.model.actionManager.add(multiaction);
```

**vs. Simpler Pattern:**

```javascript
let actions = [];
actions.push(new UpdateObject(obj, {aliases}));
actions.push(new UpdateObject(obj, {name: newName}));
W.model.actionManager.add(new MultiAction(actions));
```

**Both work!** The second is simpler and more common.

---

## 8. Getting Selected Features

### Standard Pattern

```javascript
// Get all selected features
const features = W.selectionManager.getSelectedFeatures();

// Get first selected
const feature = features[0];

// Get the model
const venue = feature.model;

// Or shorter
const venue = W.selectionManager.getSelectedFeatures()[0].model;
```

### WazeWrap Pattern

```javascript
// If using WazeWrap
const venue = WazeWrap.getSelectedFeatures()[0].WW.getObjectModel();
```

---

## 9. Event Listeners

### Venue Change Listeners

Used by: **Place Harmonizer**, **HN NavPoints**

```javascript
// Listen for venue changes
W.model.venues.on('objectschanged', (event) => {
    // Handle changes
});

// Listen for venue additions
W.model.venues.on('objectsadded', (event) => {
    // Handle new venues
});

// Listen for venue removals
W.model.venues.on('objectsremoved', (event) => {
    // Handle deletions
});
```

### Selection Change Listeners

```javascript
W.selectionManager.events.register('selectionchanged', null, (event) => {
    const selected = W.selectionManager.getSelectedFeatures();
    if (selected.length > 0 && selected[0].model.type === 'venue') {
        // Handle venue selection
    }
});
```

---

## 10. Settings/Storage Patterns

### LocalStorage with Compression

Used by: **Place Harmonizer**

```javascript
const LZString = require('lz-string');  // or include via @require

// Save
function saveSettings(compress = true) {
    const data = JSON.stringify(settings);
    if (compress) {
        localStorage.setItem('WMEPH-settings', LZString.compress(data));
    } else {
        localStorage.setItem('WMEPH-settings', data);
    }
}

// Load
function loadSettings(decompress = true) {
    const stored = localStorage.getItem('WMEPH-settings');
    if (!stored) return null;

    const data = decompress ? LZString.decompress(stored) : stored;
    return JSON.parse(data);
}
```

**When to use compression:** Large datasets (like whitelists with thousands of entries)

---

### Simple LocalStorage

Used by: **Most scripts**

```javascript
// Save
function saveSettings() {
    localStorage.setItem('MyScript-settings', JSON.stringify(settings));
}

// Load
function loadSettings() {
    const stored = localStorage.getItem('MyScript-settings');
    return stored ? JSON.parse(stored) : defaultSettings;
}
```

---

## 11. Keyboard Shortcuts

### Pattern A: W.accelerators (Older)

Used by: **Norm Name**

```javascript
I18n.translations[I18n.currentLocale()].keyboard_shortcuts.groups['myscript'] = {
    description: 'My Script',
    members: []
};

I18n.translations[I18n.currentLocale()].keyboard_shortcuts.groups.myscript.members['myAction'] = 'Do something';

W.accelerators.addAction('myAction', {group: 'myscript'});
W.accelerators.events.register('myAction', null, myFunction);
W.accelerators._registerShortcuts({myShortcut: "myAction"});
```

---

### Pattern B: Modern Shortcut Management

Used by: **GIS Layers**

```javascript
// Parse shortcut combinations
function parseShortcut(combo) {
    const parts = combo.toLowerCase().split('+');
    return {
        ctrl: parts.includes('ctrl'),
        alt: parts.includes('alt'),
        shift: parts.includes('shift'),
        key: parts[parts.length - 1]
    };
}

// Check shortcut on keypress
document.addEventListener('keydown', (e) => {
    if (e.key === 'g' && e.ctrlKey && e.altKey) {
        myFunction();
        e.preventDefault();
    }
});
```

---

## 12. UI Creation Patterns

### Adding Sidebar Tabs

Used by: **Most complex scripts**

```javascript
function addTab() {
    const tabLabel = document.createElement('a');
    tabLabel.textContent = 'My Script';
    tabLabel.href = '#sidepanel-myscript';
    tabLabel.className = 'list-group-item';

    const tabContent = document.createElement('div');
    tabContent.id = 'sidepanel-myscript';
    tabContent.className = 'tab-pane';
    tabContent.innerHTML = `
        <h3>My Script Settings</h3>
        <input type="checkbox" id="myscript-enabled" />
        <label for="myscript-enabled">Enable feature</label>
    `;

    // Add to sidebar
    document.querySelector('#user-tabs').appendChild(tabLabel);
    document.querySelector('#user-info .tab-content').appendChild(tabContent);
}
```

---

### WazeWrap Tabs (Simpler)

```javascript
WazeWrap.Interface.Tab('My Script', tabContent, function() {
    // Callback when tab shown
}, 'myScriptTab');
```

---

## 13. Common Mistakes to Avoid

### ❌ WRONG: Direct Attribute Modification

```javascript
// THIS WILL NOT SAVE!
venue.attributes.name = 'New Name';
venue.attributes.phone = '555-1234';
```

### ✅ CORRECT: Using UpdateObject

```javascript
W.model.actionManager.add(new UpdateObject(venue, {
    name: 'New Name',
    phone: '555-1234'
}));
```

---

### ❌ WRONG: Modifying Arrays Directly

```javascript
// THIS WILL NOT SAVE!
venue.attributes.services.push('WI_FI');
```

### ✅ CORRECT: Clone, Modify, Update

```javascript
const newServices = [...venue.attributes.services, 'WI_FI'];
W.model.actionManager.add(new UpdateObject(venue, {services: newServices}));
```

---

### ❌ WRONG: Multiple Separate Actions for Related Changes

```javascript
// Creates multiple undo/redo steps!
W.model.actionManager.add(new UpdateObject(venue, {name: ''}));
W.model.actionManager.add(new UpdateObject(venue, {phone: null}));
W.model.actionManager.add(new UpdateObject(venue, {url: null}));
```

### ✅ CORRECT: Single MultiAction

```javascript
const actions = [];
actions.push(new UpdateObject(venue, {name: ''}));
actions.push(new UpdateObject(venue, {phone: null}));
actions.push(new UpdateObject(venue, {url: null}));
W.model.actionManager.add(new MultiAction(actions));
```

---

## 14. Performance Best Practices

### Debouncing Event Handlers

Used by: **HN NavPoints**, **GIS Layers**

```javascript
let updateTimeout;

function debouncedUpdate() {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => {
        actualUpdateFunction();
    }, 250);  // Wait 250ms after last call
}

W.model.venues.on('objectschanged', debouncedUpdate);
```

**Why:** Prevents excessive processing when many changes happen rapidly.

---

### Batch Processing

```javascript
// Process venues in chunks to avoid UI freeze
function processVenues(venues) {
    const CHUNK_SIZE = 100;
    let index = 0;

    function processChunk() {
        const chunk = venues.slice(index, index + CHUNK_SIZE);
        chunk.forEach(venue => {
            // Process venue
        });

        index += CHUNK_SIZE;
        if (index < venues.length) {
            setTimeout(processChunk, 10);  // Give UI time to update
        }
    }

    processChunk();
}
```

---

## 15. Debugging Techniques

### Console Logging Groups

```javascript
function processVenue(venue) {
    console.group(`Processing ${venue.attributes.name}`);
    console.log('ID:', venue.attributes.id);
    console.log('Categories:', venue.attributes.categories);
    console.log('Services:', venue.attributes.services);
    console.groupEnd();
}
```

---

### Error Wrapping

Used by: **Place Harmonizer**

```javascript
function errorHandler(callback, ...args) {
    try {
        return callback(...args);
    } catch (error) {
        console.error('Script error:', error);
        // Optionally show user-friendly message
    }
}

// Usage
W.model.venues.on('objectschanged', () => errorHandler(myFunction));
```

---

## 16. Code Organization Patterns

### Modular Functions (Small Scripts)

Used by: **Quick HN**, **Norm Name**

```javascript
(function() {
    'use strict';

    // Constants
    const SCRIPT_NAME = 'My Script';

    // State variables
    let settings = {};

    // Utility functions
    function loadSettings() { /*...*/ }
    function saveSettings() { /*...*/ }

    // Main functions
    function doMainTask() { /*...*/ }

    // Initialization
    function init() { /*...*/ }
    function bootstrap() { /*...*/ }

    bootstrap();
})();
```

---

### Class-Based Organization (Large Scripts)

Used by: **Place Harmonizer**, **GIS Layers**

```javascript
class PnhEntry {
    constructor(data) {
        this.name = data.name;
        this.categories = data.categories;
    }

    matches(venue) {
        // Logic here
    }
}

class Pnh {
    static processData(data) {
        return data.map(entry => new PnhEntry(entry));
    }

    static findMatch(venue) {
        // Logic here
    }
}
```

---

## Summary: Key Takeaways

### For RPP/Venue Updates:

1. **Always** use `UpdateObject` wrapped in `actionManager.add()`
2. **Always** use `MultiAction` for multiple changes
3. **Always** clone arrays before modifying
4. **Never** modify `venue.attributes` directly

### Essential Pattern:

```javascript
const UpdateObject = require('Waze/Action/UpdateObject');
const MultiAction = require('Waze/Action/MultiAction');

const venue = W.selectionManager.getSelectedFeatures()[0].model;
const actions = [];

actions.push(new UpdateObject(venue, { name: '' }));
actions.push(new UpdateObject(venue, { phone: null }));

if (actions.length > 0) {
    W.model.actionManager.add(new MultiAction(actions));
}
```

### For Initialization:

```javascript
function waitForWME() {
    if (typeof W === 'object' && W.userscripts?.state.isReady && WazeWrap?.Ready) {
        init();
    } else {
        setTimeout(waitForWME, 100);
    }
}
waitForWME();
```

### For Imports:

```javascript
var UpdateObject;
if (typeof(require) !== "undefined") {
    UpdateObject = require("Waze/Action/UpdateObject");
} else {
    UpdateObject = W.Action.UpdateObject;
}
```

---

## Next Steps

1. Study the downloaded scripts in detail
2. Use these patterns in your own scripts
3. Test thoroughly in WME
4. Reference the WME-API-GUIDE.md for specific API details
5. Use the discovery tool to find additional WME functions

**Remember:** All these scripts are open source. You can and should study their code to learn more!
