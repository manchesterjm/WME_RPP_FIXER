# WME API Discovery Guide

## Three Ways to Discover WME API Functions

### Method 1: UserScript (Automated Discovery)
Install `wme-api-discovery.js` as a UserScript. It will:
- Add a button to the WME interface
- Automatically scan all available APIs
- Download results as JSON and text files
- Log everything to console

**Usage:**
1. Install the script in Tampermonkey/Greasemonkey
2. Load WME editor
3. Click the "🔍 Discover WME API" button
4. Check your downloads folder for results

### Method 2: Console Snippets (Quick Discovery)
Copy sections from `console-discovery-snippets.js` directly into browser console while in WME.

**Best snippets to start with:**
```javascript
// See all top-level W properties
Object.keys(W).sort().forEach(key => console.log(`W.${key}`));

// Explore a selected venue
const venue = W.selectionManager.getSelectedFeatures()[0].model;
console.log(venue);
```

### Method 3: WME Source Code Inspection
Use browser DevTools to explore the minified WME code.

---

## Essential WME API Objects

### Core Objects

#### `W` - Main WME Object
The global object containing everything.

```javascript
W.map              // Map instance
W.model            // Data model
W.controller       // Controllers
W.selectionManager // Selection handling
W.loginManager     // User info
W.app              // Application info
```

#### `W.model` - Data Model
Contains all map data and collections.

```javascript
W.model.venues           // All places/venues
W.model.segments         // All road segments
W.model.nodes            // All junctions
W.model.actionManager    // Handles undo/redo and saving
W.model.countries        // Country data
W.model.states           // State data
W.model.cities           // City data
```

#### `W.model.actionManager` - Action System
**This is the key to saving changes!**

```javascript
W.model.actionManager.add(action)     // Add single action
W.model.actionManager.undo()          // Undo last action
W.model.actionManager.redo()          // Redo last undone action
```

---

## Common WME API Patterns

### Getting Selected Venue

```javascript
// Get selected features
const features = W.selectionManager.getSelectedFeatures();

// Get first selected feature
const feature = features[0];

// Get the venue model
const venue = feature.model;

// Check if it's a venue
if (venue && venue.type === 'venue') {
    console.log('Selected venue:', venue);
}
```

### Getting Venue Attributes

```javascript
const venue = W.selectionManager.getSelectedFeatures()[0].model;

// All attributes
console.log(venue.attributes);

// Common attributes
venue.attributes.id              // Venue ID
venue.attributes.name            // Name
venue.attributes.description     // Description
venue.attributes.categories      // Array of category IDs
venue.attributes.phone           // Phone number
venue.attributes.url             // Website URL
venue.attributes.services        // Array of service IDs
venue.attributes.openingHours    // Array of OpeningHour objects
venue.attributes.lockRank        // Lock level (0-5)
venue.attributes.residential     // Boolean - is it an RPP?
venue.attributes.aliases         // Array of alternate names
venue.attributes.entryExitPoints // Entry/exit points
venue.attributes.brand           // Brand name
```

### Venue Helper Methods

```javascript
venue.isResidential()    // Returns true if RPP
venue.isParkingLot()     // Returns true if parking lot
venue.isPoint()          // Returns true if point geometry
venue.isNew()            // Returns true if not yet saved
venue.isUnchanged()      // Returns true if no pending changes
venue.getOLGeometry()    // Get OpenLayers geometry
```

### Making Changes to Venues

**CRITICAL:** Always use the action system!

```javascript
// Import required classes
const UpdateObject = require('Waze/Action/UpdateObject');
const MultiAction = require('Waze/Action/MultiAction');

// Method 1: Single update
const venue = W.selectionManager.getSelectedFeatures()[0].model;
const action = new UpdateObject(venue, { name: 'New Name' });
W.model.actionManager.add(action);

// Method 2: Multiple updates (preferred)
const actions = [];
actions.push(new UpdateObject(venue, { name: 'New Name' }));
actions.push(new UpdateObject(venue, { phone: '555-1234' }));
actions.push(new UpdateObject(venue, { url: 'https://example.com' }));
W.model.actionManager.add(new MultiAction(actions));
```

### Working with Categories

```javascript
// Categories are stored as string IDs
const categories = venue.attributes.categories;
console.log(categories); // e.g., ["GAS_STATION", "CONVENIENCE_STORE"]

// Update categories
const newCategories = ["RESTAURANT", "FAST_FOOD"];
const action = new UpdateObject(venue, { categories: newCategories });
W.model.actionManager.add(action);
```

### Working with Services

```javascript
// Services are array of strings
const services = venue.attributes.services;
console.log(services); // e.g., ["PARKING_FOR_CUSTOMERS", "WI_FI"]

// Add a service
const newServices = [...venue.attributes.services, "WHEELCHAIR_ACCESSIBLE"];
const action = new UpdateObject(venue, { services: newServices });
W.model.actionManager.add(action);

// Remove a service
const filtered = venue.attributes.services.filter(s => s !== "WI_FI");
const action = new UpdateObject(venue, { services: filtered });
W.model.actionManager.add(action);
```

### Working with Opening Hours

```javascript
const OpeningHour = require('Waze/Model/Objects/OpeningHour');

// Get current hours
const hours = venue.attributes.openingHours;

// Create new hours entry
const newHour = new OpeningHour({
    days: [1, 2, 3, 4, 5], // Mon-Fri (0=Sunday, 6=Saturday)
    fromHour: '09:00',
    toHour: '17:00'
});

// Update hours
const newHours = [...venue.attributes.openingHours, newHour];
const action = new UpdateObject(venue, { openingHours: newHours });
W.model.actionManager.add(action);
```

### Clearing RPP (Residential Place Point)

```javascript
const UpdateObject = require('Waze/Action/UpdateObject');
const MultiAction = require('Waze/Action/MultiAction');

const venue = W.selectionManager.getSelectedFeatures()[0].model;

if (venue.attributes.residential) {
    const actions = [];

    // Clear all personal info
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

    // Execute all at once
    if (actions.length > 0) {
        W.model.actionManager.add(new MultiAction(actions));
    }
}
```

### Locking a Venue

```javascript
const UpdateObject = require('Waze/Action/UpdateObject');

const venue = W.selectionManager.getSelectedFeatures()[0].model;
const lockLevel = 2; // 0-5 (represents ranks 1-6)

const action = new UpdateObject(venue, { lockRank: lockLevel });
W.model.actionManager.add(action);
```

### Getting All Venues in View

```javascript
// Get all venues
const allVenues = W.model.venues.getObjectArray();

// Filter by condition
const unlocked = W.model.venues.getObjectArray().filter(v => v.attributes.lockRank < 1);
const rpps = W.model.venues.getObjectArray().filter(v => v.attributes.residential);
const gasStations = W.model.venues.getObjectArray().filter(v =>
    v.attributes.categories.includes('GAS_STATION')
);
```

### Getting Venue Address Info

```javascript
const venue = W.selectionManager.getSelectedFeatures()[0].model;
const address = venue.getAddress();

address.attributes.street         // Street name
address.attributes.city           // City object
address.attributes.state          // State object
address.attributes.country        // Country object
address.attributes.houseNumber    // House number

// Get names
address.attributes.city.getName()
address.attributes.state.getName()
address.attributes.country.getName()
```

---

## Available Action Classes

All actions are in the `Waze/Action/` namespace:

```javascript
const MultiAction = require('Waze/Action/MultiAction');
const UpdateObject = require('Waze/Action/UpdateObject');
const UpdateFeatureGeometry = require('Waze/Action/UpdateFeatureGeometry');
const UpdateFeatureAddress = require('Waze/Action/UpdateFeatureAddress');
const DeleteObject = require('Waze/Action/DeleteObject');
const AddLandmark = require('Waze/Action/AddLandmark');
```

### UpdateObject
Updates venue attributes.

```javascript
new UpdateObject(venue, {
    name: 'New Name',
    phone: '555-1234',
    url: 'https://example.com'
});
```

### UpdateFeatureGeometry
Moves or reshapes venue geometry.

```javascript
new UpdateFeatureGeometry(venue, newGeometry);
```

### UpdateFeatureAddress
Updates venue address.

```javascript
new UpdateFeatureAddress(venue, newAddress);
```

---

## Event Listeners

Listen for changes in the WME model:

```javascript
// When venues change
W.model.venues.on('objectschanged', (event) => {
    console.log('Venues changed:', event);
});

// When venues are added
W.model.venues.on('objectsadded', (event) => {
    console.log('Venues added:', event);
});

// When venues are removed
W.model.venues.on('objectsremoved', (event) => {
    console.log('Venues removed:', event);
});

// When selection changes
W.selectionManager.events.register('selectionchanged', null, (event) => {
    console.log('Selection changed:', event);
});
```

---

## User Information

```javascript
// Current user
const user = W.loginManager.user;

user.userName        // Username
user.rank           // Rank (0-6, where 0=1, 5=6)
user.attributes     // All attributes

// Check rank
if (user.rank >= 3) {
    console.log('User is rank 4 or higher');
}
```

---

## Common Service IDs

```javascript
const SERVICES = [
    'VALLET_SERVICE',
    'DRIVETHROUGH',
    'WI_FI',
    'RESTROOMS',
    'CREDIT_CARDS',
    'RESERVATIONS',
    'OUTSIDE_SEATING',
    'AIR_CONDITIONING',
    'PARKING_FOR_CUSTOMERS',
    'DELIVERIES',
    'TAKE_AWAY',
    'WHEELCHAIR_ACCESSIBLE',
    'DISABILITY_PARKING'
];
```

---

## Debugging Tips

### Enable console logging
```javascript
// Log all venue changes
W.model.venues.on('objectschanged', (e) => console.log('Changed:', e));
```

### Inspect current selection
```javascript
// Quick inspect function
function inspectSelection() {
    const sel = W.selectionManager.getSelectedFeatures();
    console.log('Selected:', sel);
    if (sel[0] && sel[0].model) {
        console.log('Model:', sel[0].model);
        console.log('Attributes:', sel[0].model.attributes);
    }
}
```

### Test if require module exists
```javascript
function testModule(path) {
    try {
        const module = require(path);
        console.log(`✓ ${path} exists`);
        return module;
    } catch (e) {
        console.log(`✗ ${path} not found`);
        return null;
    }
}

testModule('Waze/Action/UpdateObject');
```

---

## Resources

- **WME Discord**: Ask in #dev-scripts channel
- **GreasyFork Scripts**: Study other WME scripts for examples
- **Browser DevTools**: Inspect the W object directly
- **This Discovery Tool**: Run the scripts in this folder!

---

## Quick Reference: Complete RPP Cleaner

```javascript
// Complete function to clean RPPs
function cleanRPP(venue) {
    const UpdateObject = require('Waze/Action/UpdateObject');
    const MultiAction = require('Waze/Action/MultiAction');

    if (!venue || !venue.attributes.residential) {
        console.log('Not an RPP');
        return;
    }

    const actions = [];

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

    if (actions.length > 0) {
        W.model.actionManager.add(new MultiAction(actions));
        console.log(`✓ Cleaned RPP: ${actions.length} changes`);
    } else {
        console.log('RPP already clean');
    }
}

// Usage:
const venue = W.selectionManager.getSelectedFeatures()[0].model;
cleanRPP(venue);
```
