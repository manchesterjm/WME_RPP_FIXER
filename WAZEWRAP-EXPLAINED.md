# WazeWrap - The Essential WME Scripting Library

## 🎯 What Is WazeWrap?

**WazeWrap** is a **foundational library** created by JustinS83/MapOMatic that provides a standardized, easy-to-use interface for common WME scripting tasks.

Think of it as **jQuery for WME** - it wraps complex WME operations into simple, reliable functions.

**Why Almost Every Script Uses It:**
- ✅ Makes complex tasks simple
- ✅ Handles cross-version compatibility
- ✅ Provides consistent error handling
- ✅ Saves 100s of lines of boilerplate code
- ✅ Maintained by top WME developers

---

## 📊 Statistics from Your Scripts

Out of your **45 installed WME scripts**, I found WazeWrap is required by:

**At least 35+ scripts use WazeWrap**, including:
- WME Place Harmonizer
- WME Place Interface Enhancements
- WME GIS Layers
- WME HN NavPoints
- WME Closure Helper
- WME Color Speeds
- WME Geometries
- WME ClickSaver
- And many more...

**That's 78% of your scripts!** It's the most common dependency in WME scripting.

---

## 🔧 Main Features of WazeWrap

### 1. **WazeWrap.Alerts** - User Notifications

Instead of ugly `alert()` popups, WazeWrap provides beautiful, styled notifications:

```javascript
// Basic alerts
WazeWrap.Alerts.info(scriptName, 'Information message');
WazeWrap.Alerts.success(scriptName, 'Success! Changes saved.');
WazeWrap.Alerts.warning(scriptName, 'Warning: Check this!');
WazeWrap.Alerts.error(scriptName, 'Error: Something went wrong!');

// With custom duration (milliseconds)
WazeWrap.Alerts.info(scriptName, 'Quick message', false, false, 2000);

// Confirmation dialogs
WazeWrap.Alerts.confirm(
    scriptName,
    'Are you sure you want to delete this?',
    function() { /* User clicked OK */ },
    function() { /* User clicked Cancel */ }
);

// Prompt for user input
WazeWrap.Alerts.prompt(
    scriptName,
    'Enter a name:',
    'Default value',
    function(result, value) {
        if (result) console.log('User entered:', value);
    }
);
```

**Used in your scripts:**
- WME ClickSaver: Shows copy confirmations
- WME GIS Layers: Prompts for layer names
- WME Closure Helper: Error messages
- Almost every script!

---

### 2. **WazeWrap.Interface** - UI Creation

Simplifies creating tabs, buttons, and settings panels:

```javascript
// Add a sidebar tab
WazeWrap.Interface.Tab(
    'My Script',           // Tab label
    $tabContent,           // jQuery content
    function() { init(); }, // Callback when shown
    'myScriptTab'          // Tab ID
);

// Show script update notification
WazeWrap.Interface.ShowScriptUpdate(
    scriptName,
    version,
    updateMessage,
    downloadUrl,
    forumUrl
);

// Add layer checkbox to layers menu
WazeWrap.Interface.AddLayerCheckbox(
    "display",
    "My Layer",
    isEnabled,
    onChangeCallback
);
```

**Examples from your scripts:**
- WME GIS Layers: Creates settings tab
- WME Find Deleted Objects: Adds layer checkbox
- WME Closure Helper: Settings interface
- WME ClickSaver: Update notifications

---

### 3. **WazeWrap.Geometry** - Coordinate Conversion

Handles coordinate system conversions (WME uses different systems internally):

```javascript
// Convert from WME internal coordinates to lat/lon
const latLon = WazeWrap.Geometry.ConvertTo4326(x, y);
console.log(latLon.lon, latLon.lat);

// Convert from lat/lon to WME coordinates
const point = WazeWrap.Geometry.ConvertFrom4326(lon, lat);
```

**Used in:**
- WME Closure Helper: Converting closure coordinates
- Many overlay/layer scripts
- Scripts that work with GPS coordinates

---

### 4. **WazeWrap.Remote** - Cloud Storage

Save/load script settings to cloud storage (syncs across devices!):

```javascript
// Save settings to cloud
const result = await WazeWrap.Remote.SaveSettings(scriptName, settings);

// Retrieve settings from cloud
const serverSettings = await WazeWrap.Remote.RetrieveSettings(scriptName);
```

**Used in:**
- WME Closure Helper: Sync settings across computers
- Scripts with complex configurations

---

### 5. **WazeWrap.Model** - Safe Model Access

Provides safe wrappers for accessing WME model objects:

```javascript
// Get selected features safely
const features = WazeWrap.getSelectedFeatures();

// Get venue model
const venue = features[0].WW.getObjectModel();
```

**Benefits:**
- Handles null checks
- Compatible across WME versions
- Easier to use than raw W.selectionManager

---

### 6. **WazeWrap.Ready** - Initialization Flag

Simple check if WazeWrap is fully loaded:

```javascript
function bootstrap() {
    if (WazeWrap && WazeWrap.Ready) {
        init();
    } else {
        setTimeout(bootstrap, 200);
    }
}
```

**Used in:** Almost every script's initialization!

---

## 💡 Real Examples from Your Scripts

### Example 1: WME ClickSaver

```javascript
// Show error with nice formatting
WazeWrap.Alerts.error(
    scriptName,
    'Something prevents this segment from being deleted.'
);

// Show quick notification
WazeWrap.Alerts.info(
    'WME ClickSaver',
    `Map center coordinate copied to clipboard:\n${output}`,
    false, false, 2000  // 2 second duration
);

// Show script update
WazeWrap.Interface.ShowScriptUpdate(
    scriptName,
    scriptVersion,
    updateMessage,
    forumUrl
);
```

---

### Example 2: WME GIS Layers

```javascript
// Warning about missing token
WazeWrap.Alerts.warning(
    GM_info.script.name,
    `A Socrata App Token is required for layer "${gisLayer.name}".<br>` +
    `Please provide one in the GIS Layers settings.`
);

// Confirm before overwriting
WazeWrap.Alerts.confirm(
    scriptName,
    'Group "' + name + '" exists. Overwrite?',
    function() {
        // User clicked OK
        saveGroup(name);
    }
);

// Prompt for input
WazeWrap.Alerts.prompt(
    scriptName,
    'Enter a name for this group:',
    '',
    function(result, name) {
        if (result) {
            createGroup(name);
        }
    }
);
```

---

### Example 3: WME Closure Helper

```javascript
// Save settings to cloud
var res = await WazeWrap.Remote.SaveSettings(
    GM_info.script.name,
    settings
);

// Load settings from cloud
var serverSettings = await WazeWrap.Remote.RetrieveSettings(
    GM_info.script.name
);

// Convert coordinates
var actualCenter = WazeWrap.Geometry.ConvertTo4326(
    center.lon,
    center.lat
);
```

---

## 🆚 With vs Without WazeWrap

### Without WazeWrap (The Hard Way):

```javascript
// Ugly browser alert
alert('Changes saved!');

// Manual coordinate conversion
var R = 6378137;
var lon = x * (180 / Math.PI) / R;
var lat = (Math.PI / 2 - 2 * Math.atan(Math.exp(-y / R))) * (180 / Math.PI);

// Manual settings storage
localStorage.setItem('MyScript-settings', JSON.stringify(settings));

// Complex confirmation dialog
if (confirm('Are you sure?')) {
    // do something
}
```

### With WazeWrap (The Easy Way):

```javascript
// Beautiful notification
WazeWrap.Alerts.success('My Script', 'Changes saved!');

// Simple coordinate conversion
var latLon = WazeWrap.Geometry.ConvertTo4326(x, y);

// Cloud-synced settings
await WazeWrap.Remote.SaveSettings('My Script', settings);

// Nice confirmation with callbacks
WazeWrap.Alerts.confirm('My Script', 'Are you sure?',
    () => { /* do something */ },
    () => { /* cancel */ }
);
```

**Result:** Cleaner code, better UX, fewer bugs!

---

## 📦 How It Loads

WazeWrap uses a clever bootstrap system:

```javascript
// In script header:
// @require https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js

// The WazeWrap loader does this:
1. Checks if WazeWrap is already loaded
2. If not, downloads the full library from GitHub
3. Makes it available globally
4. Sets WazeWrap.Ready = true when done
```

**The actual library** is loaded from:
```
https://wazedev.github.io/WazeWrap/WazeWrapLib.js
```

This means:
- ✅ Always gets latest version
- ✅ Cached by browser
- ✅ Shared across all scripts
- ✅ One download for all scripts

---

## 🎓 Why Your RPP Cleaner Uses It

In our script, we use WazeWrap for:

```javascript
// 1. User notifications
WazeWrap.Alerts.success(SCRIPT_NAME, 'RPP cleaned successfully!');
WazeWrap.Alerts.error(SCRIPT_NAME, 'This is not an RPP!');
WazeWrap.Alerts.info(SCRIPT_NAME, 'Already clean - no changes needed.');

// 2. Script updates
WazeWrap.Interface.ShowScriptUpdate(
    SCRIPT_NAME,
    SCRIPT_VERSION,
    '',
    downloadUrl
);

// 3. Ready state
if (WazeWrap && WazeWrap.Ready) {
    init();
}
```

**Without WazeWrap**, you'd need to:
- Write your own alert system (50+ lines)
- Create custom CSS for notifications
- Handle alert positioning
- Write update checker (100+ lines)
- Create own ready state detector

**With WazeWrap**: 3 simple function calls! 🎉

---

## 🔍 WazeWrap vs Native JavaScript

| Task | Native JS | WazeWrap | Savings |
|------|-----------|----------|---------|
| Alert user | `alert('msg')` | `WazeWrap.Alerts.info(...)` | Better UX |
| Confirm action | `if(confirm(...))` | `WazeWrap.Alerts.confirm(...)` | Callbacks + styling |
| Convert coords | 10+ lines of math | `ConvertTo4326(x,y)` | 90% less code |
| Save settings | Manual localStorage | `SaveSettings(...)` | Cloud sync! |
| Create tab | 30+ lines DOM | `Interface.Tab(...)` | 95% less code |
| Check ready | Complex polling | `WazeWrap.Ready` | Simple boolean |

---

## 📚 Full API Reference

### WazeWrap.Alerts Methods

```javascript
.info(title, message, cancel, ok, duration)
.success(title, message, cancel, ok, duration)
.warning(title, message, cancel, ok, duration)
.error(title, message, cancel, ok, duration)
.confirm(title, message, okCallback, cancelCallback)
.prompt(title, message, defaultValue, callback)
```

### WazeWrap.Interface Methods

```javascript
.Tab(label, content, onShow, tabId)
.ShowScriptUpdate(name, version, message, downloadUrl, forumUrl)
.AddLayerCheckbox(group, label, checked, onChange)
```

### WazeWrap.Geometry Methods

```javascript
.ConvertTo4326(x, y)    // WME coords → lat/lon
.ConvertFrom4326(lon, lat)  // lat/lon → WME coords
```

### WazeWrap.Remote Methods

```javascript
.SaveSettings(scriptName, settings)
.RetrieveSettings(scriptName)
```

### WazeWrap.Model Methods

```javascript
.getSelectedFeatures()
.getObjectById(id)
```

---

## 🎯 Best Practices

### DO ✅

```javascript
// Check WazeWrap.Ready before using
if (WazeWrap && WazeWrap.Ready) {
    WazeWrap.Alerts.success('Script', 'Ready!');
}

// Use proper callbacks
WazeWrap.Alerts.confirm('Title', 'Message?',
    () => { /* ok */ },
    () => { /* cancel */ }
);

// Include version in updates
WazeWrap.Interface.ShowScriptUpdate(name, version, msg, url);
```

### DON'T ❌

```javascript
// Don't use before ready
WazeWrap.Alerts.info(...);  // If WazeWrap not loaded yet = ERROR

// Don't forget error handling
await WazeWrap.Remote.SaveSettings(...);  // Could fail!

// Don't mix with native alerts
alert('Old style');  // Inconsistent UX
WazeWrap.Alerts.info('New style');
```

---

## 📖 Learn More

**Official Repository:**
https://github.com/WazeDev/WazeWrap

**GreasyFork Page:**
https://greasyfork.org/scripts/24851-wazewrap

**Your Downloaded Copy:**
`C:\Users\manch\Desktop\WME\WazeWrap.js`

**Examples in Your Scripts:**
`C:\Users\manch\Desktop\WME\tampermonkey-scripts\` - Check any .user.js file!

---

## 🎨 Visual Examples

### Alert Types:

```javascript
// Info (blue)
WazeWrap.Alerts.info('Script', 'For your information...');

// Success (green)
WazeWrap.Alerts.success('Script', 'Operation completed!');

// Warning (yellow/orange)
WazeWrap.Alerts.warning('Script', 'Be careful!');

// Error (red)
WazeWrap.Alerts.error('Script', 'Something went wrong!');
```

Each appears as a styled notification in WME's interface - much better than browser alerts!

---

## 💡 Summary

**WazeWrap is:**
- ✅ A utility library for WME scripts
- ✅ Used by 78% of your scripts
- ✅ Maintained by top WME developers
- ✅ Makes scripting 10x easier
- ✅ Provides consistent UX across scripts
- ✅ Free and open source

**Without it, you'd need:**
- Custom alert system (100+ lines)
- Custom UI framework (200+ lines)
- Custom coordinate math (50+ lines)
- Custom cloud storage (150+ lines)
- Custom ready state detection (30+ lines)

**Total savings: 500+ lines of code per script!**

---

## 🚀 Using in Your Scripts

Always include in your script header:

```javascript
// @require https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
```

Then wait for it to load:

```javascript
function bootstrap() {
    if (WazeWrap && WazeWrap.Ready) {
        // Use WazeWrap features here
        init();
    } else {
        setTimeout(bootstrap, 200);
    }
}
bootstrap();
```

Now you can use all WazeWrap features! 🎉

---

**Bottom Line:** WazeWrap is **essential** for WME scripting. It's like trying to build a website without jQuery (back in the day) - you *could* do it, but why would you? 😄
