# WME Scripting Quick Reference

## Essential Imports

```javascript
// Import action classes (use fallback for compatibility)
var UpdateObject, MultiAction;
if (typeof(require) !== "undefined") {
    UpdateObject = require("Waze/Action/UpdateObject");
    MultiAction = require("Waze/Action/MultiAction");
} else {
    UpdateObject = W.Action.UpdateObject;
    MultiAction = W.Action.MultiAction;
}
```

## Initialize Script

```javascript
function init() {
    // Your initialization code here
}

function waitForWME() {
    if (typeof W === 'object' && W.userscripts?.state.isReady && WazeWrap?.Ready) {
        init();
    } else {
        setTimeout(waitForWME, 100);
    }
}
waitForWME();
```

## Get Selected Venue

```javascript
const venue = W.selectionManager.getSelectedFeatures()[0].model;

// Check if it's actually a venue
if (venue && venue.type === 'venue') {
    // Work with venue
}
```

## Update Single Attribute

```javascript
W.model.actionManager.add(new UpdateObject(venue, {
    name: 'New Name'
}));
```

## Update Multiple Attributes (Preferred for RPPs)

```javascript
const actions = [];
actions.push(new UpdateObject(venue, { name: '' }));
actions.push(new UpdateObject(venue, { phone: null }));
actions.push(new UpdateObject(venue, { url: null }));

if (actions.length > 0) {
    W.model.actionManager.add(new MultiAction(actions));
}
```

## Clean RPP (Complete Example)

```javascript
function cleanRPP(venue) {
    if (!venue || !venue.attributes.residential) return;

    const UpdateObject = require('Waze/Action/UpdateObject');
    const MultiAction = require('Waze/Action/MultiAction');

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
    }
}
```

## Update Categories

```javascript
const newCategories = ["GAS_STATION", "CONVENIENCE_STORE"];
W.model.actionManager.add(new UpdateObject(venue, {
    categories: newCategories
}));
```

## Update Services (Add/Remove)

```javascript
// Add service
const services = [...venue.attributes.services, "WI_FI"];
W.model.actionManager.add(new UpdateObject(venue, { services }));

// Remove service
const services = venue.attributes.services.filter(s => s !== "WI_FI");
W.model.actionManager.add(new UpdateObject(venue, { services }));
```

## Update Opening Hours

```javascript
const OpeningHour = require('Waze/Model/Objects/OpeningHour');

const newHour = new OpeningHour({
    days: [1, 2, 3, 4, 5],  // Mon-Fri (0=Sun, 6=Sat)
    fromHour: '09:00',
    toHour: '17:00'
});

const hours = [...venue.attributes.openingHours, newHour];
W.model.actionManager.add(new UpdateObject(venue, { openingHours: hours }));
```

## Lock Venue

```javascript
const lockLevel = 2;  // 0-5 (represents ranks 1-6)
W.model.actionManager.add(new UpdateObject(venue, {
    lockRank: lockLevel
}));
```

## Get All Venues

```javascript
// All venues in view
const allVenues = W.model.venues.getObjectArray();

// Filter
const rpps = W.model.venues.getObjectArray()
    .filter(v => v.attributes.residential);

const unlocked = W.model.venues.getObjectArray()
    .filter(v => v.attributes.lockRank < 1);
```

## Event Listeners

```javascript
// Venue changes
W.model.venues.on('objectschanged', (event) => {
    console.log('Venues changed');
});

// Selection changes
W.selectionManager.events.register('selectionchanged', null, (event) => {
    const selected = W.selectionManager.getSelectedFeatures();
    // Handle selection
});
```

## Save/Load Settings

```javascript
function saveSettings() {
    localStorage.setItem('MyScript-settings', JSON.stringify(settings));
}

function loadSettings() {
    const stored = localStorage.getItem('MyScript-settings');
    return stored ? JSON.parse(stored) : {};
}
```

## Common Venue Attributes

```javascript
venue.attributes.id              // Venue ID
venue.attributes.name            // Name
venue.attributes.description     // Description
venue.attributes.categories      // Array of category IDs
venue.attributes.phone           // Phone number
venue.attributes.url             // Website URL
venue.attributes.services        // Array of service IDs
venue.attributes.openingHours    // Array of OpeningHour objects
venue.attributes.lockRank        // Lock level (0-5)
venue.attributes.residential     // Boolean - is RPP?
venue.attributes.aliases         // Alternate names
venue.attributes.brand           // Brand name
```

## Venue Helper Methods

```javascript
venue.isResidential()    // true if RPP
venue.isParkingLot()     // true if parking lot
venue.isPoint()          // true if point geometry
venue.isNew()            // true if not yet saved
venue.isUnchanged()      // true if no pending changes
```

## User Info

```javascript
const user = W.loginManager.user;
user.userName        // Username
user.rank           // Rank (0-6, where 0=1, 5=6)
```

## Common Services

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
    'CURBSIDE_PICKUP',
    'WHEELCHAIR_ACCESSIBLE',
    'DISABILITY_PARKING'
];
```

## Rules to Remember

### ✅ DO:
- Use `UpdateObject` for all changes
- Wrap multiple changes in `MultiAction`
- Clone arrays before modifying
- Add actions via `W.model.actionManager.add()`

### ❌ DON'T:
- Modify `venue.attributes` directly
- Push/splice arrays directly
- Create multiple separate actions for related changes
- Forget to check if venue exists before using it
