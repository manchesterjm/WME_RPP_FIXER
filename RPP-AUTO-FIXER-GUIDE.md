# WME RPP Auto-Fixer - Complete Guide

## What Changed from "WME RPP Checks (No Iteration)"

### ❌ Old Behavior (Checks Only)
- ✅ Found RPPs with missing entry points
- ✅ Found RPPs with wrong lock level
- ✅ Displayed them in a list
- ❌ **Did NOT fix them** - you had to manually fix each one

### ✅ New Behavior (Auto-Fix)
- ✅ Finds RPPs with missing entry points
- ✅ Finds RPPs with wrong lock level (1 or 2, need to be 3)
- ✅ Displays them in a list
- ✅ **Automatically fixes them ALL** with one button click
- ✅ Uses UpdateObject/MultiAction to queue changes
- ✅ You click WME's Save button once to save everything

---

## What It Fixes

### 1. Missing Entry/Exit Points
**Problem:** RPP has no entry/exit point (navigation won't work)

**Fix:** Automatically creates a NavigationPoint at the center of the RPP geometry
- Entry: ✅ Enabled
- Exit: ✅ Enabled
- Primary: ✅ Yes

### 2. Wrong Lock Level
**Problem:** RPP is locked to level 1 or 2 (should be level 3)

**Fix:** Sets `lockRank = 2` which displays as "Level 3" in WME UI

**Lock Level Translation:**
```
lockRank 0 = UI Level 1
lockRank 1 = UI Level 2
lockRank 2 = UI Level 3 ← Target
lockRank 3 = UI Level 4
etc.
```

**Important:** Only changes level 1-2 to level 3. Does NOT touch RPPs already at level 3+.

---

## Installation

### 1. Disable Old Script (If Installed)
Open Tampermonkey dashboard and **disable** "WME RPP Checks (No Iteration)"

### 2. Install New Script
1. Press `Ctrl+O` in your text editor
2. Navigate to: `C:\Users\manch\Desktop\WME\wme-rpp-auto-fixer.user.js`
3. Open the file
4. Copy all contents
5. Open Tampermonkey → Click "+" to create new script
6. Paste the code
7. Click Save (Ctrl+S)

### 3. Refresh WME
1. Go to Waze Map Editor
2. Press `Ctrl+R` to refresh
3. Look for **🔧 RPP Fix** tab in left sidebar

---

## How to Use

### Step 1: Open the Tab
Click the **🔧 RPP Fix** tab in the WME sidebar

### Step 2: Review What Needs Fixing
The tab will show:
```
🔧 RPP Auto-Fixer
Total RPPs: 127
Need Fixing: 23

• Missing entry point: 15
• Lock level 1-2 (need L3): 18

[✅ Fix All RPPs]

RPPs Needing Work:
• 123 Main St - EP+L3
• 456 Oak Ave - EP
• 789 Pine Rd - L3
```

**Suffix Legend:**
- `EP` = Needs Entry Point
- `L3` = Needs Lock Level 3
- `EP+L3` = Needs both

### Step 3: Click "Fix All RPPs"
1. Click the green **✅ Fix All RPPs** button
2. Script will automatically:
   - Add entry points where missing
   - Change lock levels to 3 where needed
   - Queue all changes using UpdateObject/MultiAction

### Step 4: Save Changes
1. **Alert will appear:** "✅ Fixed 23 RPPs with 41 changes! Click the Save button to save all changes."
2. Click **Save** button in WME (top toolbar or Ctrl+S)
3. All changes will be saved at once

### Step 5: Verify
- Tab will refresh and show updated counts
- Fixed RPPs will disappear from the list
- Console will show what was fixed

---

## Console Output

When you click "Fix All RPPs", the console will log:

```
autoFixAllRPPs: Starting auto-fix...
Added entry point to: 123 Main St
Set lock level 3 for: 123 Main St
Added entry point to: 456 Oak Ave
Set lock level 3 for: 789 Pine Rd
Fixed 23 RPPs with 41 changes!
```

---

## Technical Details

### UpdateObject Pattern
The script uses the correct WME pattern for saving:

```javascript
const { UpdateObject, MultiAction } = require('Waze/Model/Objects');
const actions = [];

// Add entry point
actions.push(new UpdateObject(rpp, {
    entryExitPoints: [navPoint]
}));

// Change lock level
actions.push(new UpdateObject(rpp, {
    lockRank: 2
}));

// Save all changes as one action
W.model.actionManager.add(new MultiAction(actions));
```

### NavigationPoint Class
The script includes the full NavigationPoint class (lines 13-56) for creating entry/exit points:

```javascript
const point = rpp.getOLGeometry().getCentroid();
const geoJSONPoint = W.userscripts.toGeoJSONGeometry(point);
const navPoint = new NavigationPoint(geoJSONPoint);
```

This creates a properly formatted entry/exit point that WME can save.

---

## Differences from Old Script

| Feature | Old "RPP Checks" | New "RPP Auto-Fixer" |
|---------|------------------|----------------------|
| **Scans RPPs** | ✅ Yes | ✅ Yes |
| **Lists problems** | ✅ Yes | ✅ Yes |
| **Click to select** | ✅ Yes | ✅ Yes |
| **Auto-fixes** | ❌ No | ✅ **YES** |
| **Adds entry points** | ❌ Manual | ✅ **Automatic** |
| **Changes lock level** | ❌ Manual | ✅ **Automatic** |
| **Uses UpdateObject** | ❌ No | ✅ **YES** |
| **Queues for save** | ❌ No | ✅ **YES** |
| **Highlights fixed** | ✅ Yes | ✅ Yes (re-scans) |

---

## Safety Features

### 1. Validates Before Fixing
- Only touches RPPs with category "RESIDENCE_HOME"
- Only adds entry point if missing (won't overwrite existing)
- Only changes lock level if < 2 (won't downgrade level 3+)

### 2. Single Undo/Redo Action
All changes are wrapped in `MultiAction`, so:
- **Undo once** = undoes all RPP fixes
- **Redo once** = redoes all RPP fixes

### 3. Error Handling
```javascript
try {
    // Add entry point
} catch (err) {
    console.error('Failed to add entry point:', err);
    // Continues with other RPPs
}
```

If one RPP fails, the script continues with the rest.

### 4. Must Click Save
Changes are queued but **NOT saved** until you click Save button. You can review the changes first.

---

## Troubleshooting

### Tab Shows "Error: WME data not ready"
**Solution:** Wait a few seconds and zoom in/out to trigger map data load

### "Fix All RPPs" Button Doesn't Appear
**Check:** Make sure there are actually RPPs that need fixing
- If all RPPs already have entry points and lock level 3+, no button will appear

### Console Error: "UpdateObject is not a constructor"
**Check:** Make sure you're on the latest WME beta
**Solution:** Try refreshing the page (Ctrl+R)

### Changes Not Saving
**Check:** Did you click the Save button after fixing?
**Solution:** Click Save button in WME toolbar (or press Ctrl+S)

### Some RPPs Still in List After Fixing
**Check:** Did the save succeed?
**Solution:**
1. Check console for errors
2. Make sure you clicked Save
3. Wait for save to complete
4. Re-scan by switching tabs

---

## Console Commands for Testing

### Check a Specific RPP
```javascript
// Select an RPP, then run:
const rpp = W.selectionManager.getSelectedDataModelObjects()[0];
console.log('Entry/Exit Points:', rpp.attributes.entryExitPoints);
console.log('Lock Rank:', rpp.attributes.lockRank);
console.log('Categories:', rpp.attributes.categories);
```

### Manually Create Entry Point
```javascript
const rpp = W.selectionManager.getSelectedDataModelObjects()[0];
const point = rpp.getOLGeometry().getCentroid();
const geoJSONPoint = W.userscripts.toGeoJSONGeometry(point);
console.log('GeoJSON Point:', geoJSONPoint);
```

### Test NavigationPoint Class
```javascript
const point = { type: "Point", coordinates: [-122.4194, 37.7749] };
const navPoint = new NavigationPoint(point);
console.log('Navigation Point:', navPoint.toJSON());
```

---

## Keyboard Shortcuts

The script doesn't currently have keyboard shortcuts, but you can add one:

```javascript
// Add this to line 84 (after tab registration):
document.addEventListener('keydown', function(e) {
    // Alt+Shift+F = Fix All RPPs
    if (e.altKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        autoFixAllRPPs();
    }
});
```

---

## Future Enhancements

Possible improvements:
1. **Batch processing** - Fix N RPPs at a time instead of all at once
2. **Undo specific fix** - Remove individual RPPs from the fix queue
3. **Preview changes** - Show exactly what will change before fixing
4. **Statistics** - Track how many RPPs fixed per session
5. **Filter options** - Only fix entry points OR only fix lock levels

---

## Questions?

- **Why NavigationPoint class?** WME requires entry/exit points to be NavigationPoint objects, not plain JSON
- **Why lockRank 2 = Level 3?** WME uses 0-indexed lock ranks (0=L1, 1=L2, 2=L3, etc.)
- **Why MultiAction?** Wraps all changes into single undo/redo operation
- **Why not auto-save?** Safety - lets you review changes before saving
- **Can I undo?** Yes! Ctrl+Z or WME's undo button will undo ALL fixes at once

---

## Version History

### v2.0.0 (Current)
- ✅ Auto-fixes RPPs with missing entry points
- ✅ Auto-fixes RPPs with wrong lock levels
- ✅ Uses UpdateObject/MultiAction pattern
- ✅ Includes NavigationPoint class
- ✅ One-click fix all
- ✅ Shows before/after counts

### v1.0.0 (Old "RPP Checks")
- ✅ Scanned and listed RPPs needing work
- ❌ Did not auto-fix

---

**Ready to use!** Install the script and start fixing RPPs automatically. 🚀
