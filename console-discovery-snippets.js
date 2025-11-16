// Quick WME API Discovery - Console Snippets
// Copy and paste these into your browser console while in WME

// ============================================
// 1. LIST ALL W OBJECT TOP-LEVEL PROPERTIES
// ============================================
Object.keys(W).sort().forEach(key => console.log(`W.${key}`));


// ============================================
// 2. EXPLORE W.MODEL OBJECTS
// ============================================
console.log('=== W.model properties ===');
Object.keys(W.model).sort().forEach(key => {
    const type = typeof W.model[key];
    console.log(`W.model.${key} [${type}]`);
});


// ============================================
// 3. LIST ALL VENUE/PLACE METHODS
// ============================================
function listVenueMethods() {
    const venue = W.selectionManager.getSelectedFeatures()[0];
    if (!venue || !venue.model.type === 'venue') {
        console.error('Please select a venue/place first!');
        return;
    }

    console.log('=== Venue Model Methods ===');
    const methods = [];
    let obj = venue.model;

    while (obj) {
        Object.getOwnPropertyNames(obj).forEach(prop => {
            if (typeof obj[prop] === 'function' && !methods.includes(prop)) {
                methods.push(prop);
            }
        });
        obj = Object.getPrototypeOf(obj);
    }

    methods.sort().forEach(m => console.log(`venue.model.${m}()`));
}
listVenueMethods();


// ============================================
// 4. DISCOVER ALL REQUIRE() MODULES
// ============================================
function testRequire(paths) {
    const results = {};
    paths.forEach(path => {
        try {
            const module = require(path);
            results[path] = { success: true, type: typeof module };
            console.log(`✓ ${path}`);
        } catch (e) {
            results[path] = { success: false, error: e.message };
            console.log(`✗ ${path}`);
        }
    });
    return results;
}

// Test common WME modules
const commonModules = [
    'Waze/Action/MultiAction',
    'Waze/Action/UpdateObject',
    'Waze/Action/UpdateFeatureAddress',
    'Waze/Action/UpdateFeatureGeometry',
    'Waze/Action/DeleteObject',
    'Waze/Action/AddLandmark',
    'Waze/Model/Objects/OpeningHour',
    'Waze/Model/Objects/Venue',
    'Waze/Model/Objects/Segment',
    'Waze/Model/Objects/Node',
    'Waze/Feature/Vector/Landmark'
];

console.log('=== Testing Require Modules ===');
testRequire(commonModules);


// ============================================
// 5. EXPLORE SELECTED VENUE ATTRIBUTES
// ============================================
function exploreSelectedVenue() {
    const venue = W.selectionManager.getSelectedFeatures()[0];
    if (!venue || venue.model.type !== 'venue') {
        console.error('Please select a venue/place first!');
        return;
    }

    console.log('=== Selected Venue ===');
    console.log('Model:', venue.model);
    console.log('Attributes:', venue.model.attributes);
    console.log('Type:', venue.model.type);
    console.log('Categories:', venue.model.attributes.categories);
    console.log('Is Residential:', venue.model.isResidential());
    console.log('Is Parking Lot:', venue.model.isParkingLot());
    console.log('Is Point:', venue.model.isPoint());

    return venue.model;
}
exploreSelectedVenue();


// ============================================
// 6. LIST ALL ACTION MANAGER METHODS
// ============================================
console.log('=== W.model.actionManager Methods ===');
Object.getOwnPropertyNames(Object.getPrototypeOf(W.model.actionManager))
    .filter(prop => typeof W.model.actionManager[prop] === 'function')
    .sort()
    .forEach(method => console.log(`W.model.actionManager.${method}()`));


// ============================================
// 7. EXPLORE VENUE COLLECTIONS
// ============================================
console.log('=== Venue Collection Methods ===');
console.log('W.model.venues:', W.model.venues);
Object.getOwnPropertyNames(Object.getPrototypeOf(W.model.venues))
    .filter(prop => typeof W.model.venues[prop] === 'function')
    .sort()
    .forEach(method => console.log(`W.model.venues.${method}()`));


// ============================================
// 8. GET ALL VENUES IN VIEW
// ============================================
function getVenuesInView() {
    const venues = W.model.venues.getObjectArray();
    console.log(`Total venues: ${venues.length}`);

    // Sample first few
    venues.slice(0, 5).forEach(v => {
        console.log({
            id: v.attributes.id,
            name: v.attributes.name,
            categories: v.attributes.categories,
            isResidential: v.isResidential(),
            isParkingLot: v.isParkingLot()
        });
    });

    return venues;
}
getVenuesInView();


// ============================================
// 9. EXPLORE UpdateObject PARAMETERS
// ============================================
const UpdateObject = require('Waze/Action/UpdateObject');
console.log('=== UpdateObject ===');
console.log('Constructor:', UpdateObject.toString());
console.log('Prototype methods:', Object.getOwnPropertyNames(UpdateObject.prototype));


// ============================================
// 10. DEEP OBJECT EXPLORER FUNCTION
// ============================================
function deepExplore(obj, path = '', maxDepth = 2, currentDepth = 0) {
    if (currentDepth >= maxDepth || !obj) {
        return;
    }

    const indent = '  '.repeat(currentDepth);

    try {
        Object.keys(obj).forEach(key => {
            const fullPath = path ? `${path}.${key}` : key;
            const value = obj[key];
            const type = typeof value;

            if (type === 'function') {
                console.log(`${indent}${fullPath}() [function]`);
            } else if (type === 'object' && value !== null) {
                console.log(`${indent}${fullPath} [object]`);
                if (currentDepth < maxDepth - 1) {
                    deepExplore(value, fullPath, maxDepth, currentDepth + 1);
                }
            } else {
                console.log(`${indent}${fullPath} = ${value} [${type}]`);
            }
        });
    } catch (e) {
        console.error(`Error exploring ${path}:`, e.message);
    }
}

// Usage examples:
console.log('=== Deep Explore W.model.actionManager ===');
deepExplore(W.model.actionManager, 'W.model.actionManager', 2);


// ============================================
// 11. LIST ALL CONTROLLERS
// ============================================
console.log('=== W.controller ===');
if (W.controller) {
    Object.keys(W.controller).sort().forEach(key => {
        console.log(`W.controller.${key}`);
    });
}


// ============================================
// 12. SAVE ALL DISCOVERIES TO GLOBAL OBJECT
// ============================================
window.WME_DISCOVERY = {
    W_keys: Object.keys(W).sort(),
    model_keys: Object.keys(W.model).sort(),
    controller_keys: W.controller ? Object.keys(W.controller).sort() : [],
    map_keys: Object.keys(W.map).sort(),
    actionManager_methods: Object.getOwnPropertyNames(Object.getPrototypeOf(W.model.actionManager))
        .filter(p => typeof W.model.actionManager[p] === 'function'),
    venues_methods: Object.getOwnPropertyNames(Object.getPrototypeOf(W.model.venues))
        .filter(p => typeof W.model.venues[p] === 'function'),
    selectionManager_methods: Object.getOwnPropertyNames(Object.getPrototypeOf(W.selectionManager))
        .filter(p => typeof W.selectionManager[p] === 'function')
};

console.log('✅ All discoveries saved to window.WME_DISCOVERY');
console.log(window.WME_DISCOVERY);


// ============================================
// 13. DOWNLOAD DISCOVERY AS JSON
// ============================================
function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

downloadJSON(window.WME_DISCOVERY, 'wme-api-discovery.json');
console.log('📥 Discovery downloaded as wme-api-discovery.json');
