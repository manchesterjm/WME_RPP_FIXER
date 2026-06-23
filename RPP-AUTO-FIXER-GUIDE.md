# WME RPP Auto-Fixer - Complete Guide

**Current Version**: 4.0.9

## Overview

WME RPP Auto-Fixer is an advanced userscript that automatically fixes Residential Place Points (RPPs) in the Waze Map Editor. It works in two powerful modes:

### 🎯 Manual Mode (Always Active)
- Automatically fixes RPPs as you pan around the map
- No button clicking needed
- Fixes accumulate in WME's save queue
- You just save when ready

### 🤖 Auto-Scan Mode (Optional)
- Automatically scans entire visible area
- Grid-based systematic coverage
- Real-time progress bar with ETA
- Event-driven for maximum speed (~8x faster than manual scanning)

### ✅ What It Fixes

#### 1. Missing Entry/Exit Points
**Problem:** RPP has no entry/exit point (navigation won't work)

**Fix:** Automatically creates a NavigationPoint at the center of the RPP geometry
- Entry: ✅ Enabled
- Exit: ✅ Enabled
- Primary: ✅ Yes

#### 2. Wrong Lock Level
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

### ✅ What It Skips (v4.0.7+)

#### RPPs with Pending Update Requests
**Problem:** WME rejects edits to venues with pending Place Update Requests (PURs). Trying to save a fix for one of these triggers the "That change isn't allowed at this time and won't be sent for review" toast.

**Skip:** Any venue where `attributes.venueUpdateRequests.length > 0` is left untouched. Counted in the new "Skipped (pending URs)" stat row (orange).

To handle these manually: open the place in WME → click **Review requests** → approve or dismiss → re-run the auto-fixer over that area.

---

## Installation

> **Browser Requirement:** Use **Google Chrome** with **Violentmonkey** for WME script development.

### 1. Prerequisites
1. Install Google Chrome (if not already)
2. Install Violentmonkey from Chrome Web Store
3. Go to `chrome://extensions` → Find Violentmonkey → Click **Details**
4. Enable **"Allow access to file URLs"** (required for auto-reload)

### 2. Disable Old Script (If Installed)
Open Violentmonkey dashboard and **disable** "WME RPP Checks (No Iteration)"

### 3. Install New Script (Loader + Local File - Recommended)
1. Click Violentmonkey icon → Click gear icon (Dashboard)
2. Drag `wme-rpp-auto-fixer-loader.user.js` onto the dashboard and install it
3. The loader uses `@require file:///C:/Users/manch/Desktop/WME/RPP-Auto-Fixer/wme-rpp-auto-fixer.user.js`
4. Save edits to `wme-rpp-auto-fixer.user.js` → refresh WME and changes pick up immediately. No version bump or re-install needed for the loader.

### Alternative: Drag & Drop Install
1. Open Violentmonkey Dashboard
2. Drag `wme-rpp-auto-fixer.user.js` onto the dashboard
3. Click "Install" when prompted (note: changes won't auto-reload — you'd have to re-install on every edit)

### 4. Refresh WME
1. Go to Waze Map Editor in Chrome
2. Press `Ctrl+Shift+R` to hard refresh
3. Look for **🔧 RPP Fix** tab in left sidebar

---

## How to Use

### Mode 1: Manual Mode (Automatic)

**This mode is always active** - the script automatically fixes RPPs as you pan around the map.

1. **Pan around WME** - Just move the map normally
2. **Script auto-fixes** - As RPPs come into view, they're automatically fixed
3. **Check the sidebar** - The **🔧 RPP Fix** tab shows:
   ```
   ✅ AUTO-FIX ENABLED
   RPPs are being fixed automatically as you pan around.

   Session Statistics:
   • Total Fixed: 23
   • Entry Points Added: 15
   • Lock Levels Fixed: 18
   ```
4. **Save when ready** - Click WME's Save button (or Ctrl+S) to save all accumulated fixes

**Pause/Resume:**
- Click **⏸️ Pause Auto-Fix** to temporarily stop fixing
- Click **▶️ Resume Auto-Fix** to continue

---

### Mode 2: Auto-Scan Mode (Optional)

**Use this to systematically scan an entire area** without manually panning.

#### Step 1: Position the Map
1. Zoom to show the area you want to scan
2. Ensure all RPPs in the area are visible at your current zoom level

#### Step 2: Start Auto-Scan
1. Open **🔧 RPP Fix** tab
2. Click **▶️ Start Auto-Scan** button
3. Script will:
   - Zoom to level 19 (optimal for fast scanning)
   - Divide visible area into a grid
   - Automatically pan through each tile
   - Fix all RPPs found

#### Step 3: Monitor Progress
Real-time progress display shows:
```
🔄 SCANNING IN PROGRESS
Row 5/10, Col 3/8

[████████████░░░░░░░░] 52.5%

Estimated time remaining: 3m 45s
```

**Controls:**
- **⏸️ Pause Scan** - Temporarily pause (you can resume from same spot)
- **⏹️ Stop Scan** - Cancel and return to original position

#### Step 4: Auto-Pause at 100 Changes (NEW in v3.11.0)
**Important WME Performance Protection:**

WME becomes very slow when more than 100 changes are pending save. To prevent performance issues, the script now:

1. **Automatically pauses** when you reach 100 pending changes
2. **Alerts you** to save your changes:
   ```
   ⚠️ You have 100 changes pending!

   WME slows down with more than 100 pending changes.

   Please click Save to continue scanning.
   ```
3. **Monitors for save completion** - When you click WME's Save button
4. **Automatically resumes** scanning after a 1-second delay

**What You'll See:**
- Session Statistics shows: `Pending changes: 85 / 100` (in orange when ≥80)
- Color coding:
  - **Black**: 0-79 changes (safe)
  - **Orange**: 80-99 changes (warning)
  - **Red/Bold**: 100+ changes (limit reached)

**Your Action:**
1. Script pauses automatically at 100 changes
2. Click WME's **Save** button (top toolbar)
3. Wait for save to complete
4. Script automatically resumes scanning
5. Counter resets to 0

**No manual intervention needed** - Just save when prompted and the scan continues automatically!

#### Step 5: Scan Completion (NEW in v3.12.0)
When the scan finishes, you'll see a completion alert:
```
Scan complete!

Scan duration: 3m 45s
Total RPPs seen: 847
RPPs fixed: 23

Don't forget to click Save!
```

The scan statistics will also appear in the Session Statistics box showing:
- How many RPPs were encountered during the scan
- How long the scan took to complete

#### Step 6: Save Changes
1. After scan completes, check **Session Statistics**
2. Click WME's **Save** button to save all fixes
3. Map returns to original position and zoom

---

## UI Overview

The **🔧 RPP Fix** tab displays:

### Auto-Fix Status Box
```
✅ AUTO-FIX ENABLED  (or ⏸️ AUTO-FIX PAUSED)
RPPs are being fixed automatically as you pan around.
```

### Scanner Status Box (when active)
```
🔄 SCANNING IN PROGRESS
Row 5/10, Col 3/8

[████████████░░░░░░░░] 52.5%

Estimated time remaining: 3m 45s
```

### Session Statistics
```
Session Statistics:
• Total Fixed: 23
• Entry Points Added: 15
• Lock Levels Fixed: 18
• Queued for deletion: 0
• Skipped (pending URs): 3
• Pending: 15 / 100

Last Scan: 847 RPPs seen, completed in 3m 45s

Current view: 12 RPPs
```
- Pending shows in orange when ≥80, red/bold when ≥100
- Skipped (pending URs) — venues with `venueUpdateRequests.length > 0`
- Last Scan stats only appear after completing an auto-scan

### Recent Fixes Panel (v4.0.5+)
A clickable list of the last 25 RPPs the script has touched (newest first). Click any address to:
1. Pan the map to its saved coordinates (works even if the venue isn't currently loaded)
2. Auto-select the venue once the tile finishes loading

Use this to identify the failing RPP if WME ever rejects a save — it will be in this list.

### Control Buttons
- **⏸️ Pause Auto-Fix** / **▶️ Resume Auto-Fix** - Control manual mode
- **▶️ Start Auto-Scan** - Begin automatic scanning
- **⏸️ Pause Scan** / **▶️ Resume Scan** - Control scan
- **⏹️ Stop Scan** - Cancel scan
- **🔄 Reset** - Clear session statistics
- **🔬 Dump Selected** - Diagnostic: with a venue selected in WME, dumps its full attribute object + nearby Map Update Requests to the browser console. Useful for discovering attribute names when WME rejects an unexpected venue type.

---

## Console Output

The script logs all actions to the console (F12 → Console):

```
Script loaded: WME RPP Auto-Fixer v3.12.0 - RPP tracking & scan duration
Merge complete, scanning tile...
Scan: 4 RPPs visible, 0 already fixed this session
✅ Added entry point for: 123 Main St
✅ Set lock level 3 for: 123 Main St
✅ Added entry point for: 456 Oak Ave
Scan grid: 8 cols × 10 rows
Viewport: 2048 × 1536
Step: 1843 × 1382 (10% overlap)
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

## Feature Evolution

| Feature               | v1.0 "RPP Checks" | v3.0.0 "Auto-Fix" | v3.10.2 "Auto-Scan" |
| --------------------- | ----------------- | ----------------- | ------------------- |
| **Scans RPPs**        | ✅ Yes             | ✅ Yes             | ✅ Yes               |
| **Auto-fixes**        | ❌ No              | ✅ Click button    | ✅ **Automatic**     |
| **Manual mode**       | ❌ No              | ❌ No              | ✅ **Pan & fix**     |
| **Auto-scan**         | ❌ No              | ❌ No              | ✅ **Grid scan**     |
| **Progress bar**      | ❌ No              | ❌ No              | ✅ **Visual**        |
| **ETA display**       | ❌ No              | ❌ No              | ✅ **Real-time**     |
| **Event-driven**      | ❌ No              | ❌ No              | ✅ **mergeend**      |
| **Uses UpdateObject** | ❌ No              | ✅ Yes             | ✅ Yes               |
| **Queues for save**   | ❌ No              | ✅ Yes             | ✅ Yes               |

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
**Solution:** Wait a few seconds and pan the map to trigger data load

### Auto-Fix Not Working
**Check:**
- Is auto-fix paused? Click **▶️ Resume Auto-Fix**
- Are you panning the map? Auto-fix only works when map data loads
**Solution:** Pan to a different area or click Start Auto-Scan

### Auto-Scan Stuck or Slow
**Check:** Are layers turned off? (Script does this automatically)
**Solution:**
- Click **⏹️ Stop Scan** and try again
- Refresh WME (Ctrl+R) if persists

### Console Error: "UpdateObject is not a constructor"
**Check:** Make sure you're on the latest WME
**Solution:** Try refreshing the page (Ctrl+R)

### Changes Not Saving
**Check:** Did you click the Save button after fixing?
**Solution:** Click Save button in WME toolbar (or press Ctrl+S)

### Progress Bar Stuck at 0%
**Check:** Is the scan actually running? Look for "🔄 SCANNING IN PROGRESS"
**Solution:** Map may not have any RPPs in grid area to scan

### Stats Not Updating
**Check:** Session statistics not increasing?
**Solution:**
1. Check console for errors (F12 → Console)
2. Ensure you're panning to new areas (not rescanning same RPPs)
3. Already-fixed RPPs won't increment stats again

---

## Console Commands for Testing

### Check a Specific RPP
```javascript
// Select an RPP in WME, then run in console (F12):
const rpp = W.selectionManager.getSelectedDataModelObjects()[0];
console.log('Entry/Exit Points:', rpp.attributes.entryExitPoints);
console.log('Lock Rank:', rpp.attributes.lockRank);
console.log('Categories:', rpp.attributes.categories);
```

### Manually Create Entry Point (Testing)
```javascript
const rpp = W.selectionManager.getSelectedDataModelObjects()[0];
const point = rpp.getOLGeometry().getCentroid();
const geoJSONPoint = W.userscripts.toGeoJSONGeometry(point);
console.log('GeoJSON Point:', geoJSONPoint);
```

---

## Performance Tips

### For Best Results:
1. **Use Auto-Scan for large areas** - Much faster than manual panning
2. **Zoom 19 is optimal** - Script automatically uses this for scanning
3. **Let mergeend complete** - Script waits for WME data to fully load
4. **Save periodically** - Don't accumulate thousands of changes

### Performance Metrics:
- **Manual Mode**: ~5-10 RPPs/minute (depends on panning speed)
- **Auto-Scan Mode**: ~50-100 RPPs/minute at zoom 19
- **Event-driven**: ~8x faster than old timer-based approach

---

## Version History

- **v1.0**: RPP checker only (no fixing)
- **v3.0.0**: Added auto-fix button
- **v3.6.0**: Added auto-scan with event-driven architecture
- **v3.7.0**: Added ETA display
- **v3.8.0**: Code quality improvements (SOFA principles)
- **v3.9.0**: ESLint integration
- **v3.10.0**: Visual progress bar
- **v3.10.2**: Zoom 19 optimization
- **v3.14.0**: SOFA refactor - major complexity reduction
- **v3.14.1**: Event listener fix for WME API changes
- **v3.14.2**: Viewport filtering fix - only processes RPPs in current view
- **v3.15.0**: Multi-scan per tile - catches late-loading RPPs for better coverage
- **v4.0.3**: Synced in-UI `SCRIPT_VERSION` constant with header `@version` (UI was stuck displaying 4.0.2)
- **v4.0.4**: Per-tile dwell reduced from 2,100 ms → 500 ms for Chrome (`scanIntervalMs` 800→200, `delayMs` 500→100). Same 3-scan safety margin, just compressed timings.
- **v4.0.5**: Added Recent Fixes sidebar list (last 25 fixed RPPs, clickable to select). Removed redundant ETA render after pan — ETA now displays once per tile instead of twice.
- **v4.0.6**: Recent Fixes click now pans to saved coords first then selects after `mergeend` (works at any zoom). Added 🔬 Dump Selected diagnostic button.
- **v4.0.7**: Skip RPPs with pending update requests (`venue.attributes.venueUpdateRequests.length > 0`) — prevents the WME "That change isn't allowed at this time" save rejection. Adds "Skipped (pending URs)" stat row.
- **v4.0.8**: (changelog entry pending — no pre-change backup exists to diff against; needs to be filled in from memory of the edits)
- **v4.0.9**: (changelog entry pending — no pre-change backup exists to diff against; needs to be filled in from memory of the edits)

---

## Credits

- **Script Author**: Created with assistance from Claude (Anthropic)
- **Inspired By**: WME Validator's scanning mechanism
- **NavigationPoint Class**: Adapted from WME Utils
- **Testing & Feedback**: Community contributors

---

## License

This script is provided as-is for WME editors. Feel free to modify and improve!

---

**Last Updated**: April 24, 2026 (header synced to v4.0.9; changelog entries for 4.0.8/4.0.9 still pending)
