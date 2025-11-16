# WME Scripts Collection & Learning Resources

This folder contains a comprehensive collection of WME (Waze Map Editor) scripts and learning materials for developing your own WME UserScripts.

## 📁 Folder Contents

### Original Scripts (8 Downloaded)

1. **wme-fix-ui.user.js** (210KB) - UI customization and fixes
2. **wme-gis-layers.user.js** (270KB) - GIS layer overlays
3. **wme-hn-navpoints.user.js** (56KB) - House number navigation points visualization
4. **wme-norm-name.user.js** (54KB) - Street name standardization
5. **wme-place-interface-enhancements.user.js** (263KB) - Advanced place editing features
6. **wme-quick-hn.user.js** (12KB) - Fast house number insertion
7. **wme-speedhelper.user.js** (167KB) - Speed data entry helper
8. **wme-wazebar.user.js** (75KB) - Top toolbar with forum/wiki links

### Reference Script

9. **wme.txt** (561KB) - WME Place Harmonizer (your original reference)

---

## 📚 Documentation & Learning Materials

### Core Guides

**CLAUDE.md**
- High-level architecture of WME Place Harmonizer
- Component breakdown and data flow
- Key functions and classes reference

**WME-API-GUIDE.md** ⭐ START HERE
- Complete WME API reference
- Common patterns with code examples
- How to properly save changes (the key issue!)
- Complete working RPP cleaner example
- Category IDs, service IDs, and more

**WME-SCRIPTS-ANALYSIS.md** ⭐ ESSENTIAL READING
- Comparative analysis of all 8 downloaded scripts
- 16 different pattern comparisons
- What works, what doesn't, and why
- Common mistakes to avoid
- Best practices from real-world scripts

**QUICK-REFERENCE.md** ⭐ KEEP THIS HANDY
- Quick copy/paste code snippets
- Essential imports
- Complete RPP cleaner function
- Common operations cheat sheet

**HOW-TO-INSTALL.md**
- How to install UserScripts in Tampermonkey
- Multiple installation methods
- Troubleshooting guide

---

## 🔍 Discovery Tools

**wme-api-discovery.js** (UserScript)
- Automated WME API scanner
- Installs in Tampermonkey
- Downloads complete API catalog
- Creates wme-api-discovery.json and .txt files

**console-discovery-snippets.js**
- 13 code snippets for browser console
- Quick API exploration
- No installation needed
- Copy/paste directly into DevTools

**Discovery Results:**
- `wme-api-discovery.json` - Machine-readable API catalog
- `wme-api-discovery.txt` - Human-readable API list

---

## 🚀 Getting Started

### If You're New to WME Scripting:

1. Read **WME-API-GUIDE.md** first (especially the RPP section)
2. Read **WME-SCRIPTS-ANALYSIS.md** sections 1-3 (initialization and imports)
3. Keep **QUICK-REFERENCE.md** open while coding
4. Install **wme-api-discovery.js** to explore the API
5. Study the downloaded scripts for real examples

### If You're Debugging RPP Issues:

1. Read **WME-API-GUIDE.md** → "Clearing RPP" section
2. Read **WME-SCRIPTS-ANALYSIS.md** → Section 3: "Making Updates"
3. Use **QUICK-REFERENCE.md** → "Clean RPP" example
4. Look at **wme.txt** lines 7086-7116 for the working example

### If You Want to Build Your Own Script:

1. Copy the template from **QUICK-REFERENCE.md**
2. Use patterns from **WME-SCRIPTS-ANALYSIS.md**
3. Reference **WME-API-GUIDE.md** for specific APIs
4. Study similar functionality in the downloaded scripts
5. Use **wme-api-discovery.js** to find specific functions

---

## 🔑 Key Learnings (TL;DR)

### The Critical Pattern for Saving Changes:

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

### Why Your RPP Script Wasn't Working:

❌ **What you were probably doing:**
```javascript
venue.attributes.name = '';  // Doesn't save!
```

✅ **What you need to do:**
```javascript
W.model.actionManager.add(new UpdateObject(venue, { name: '' }));  // Saves!
```

✅ **For multiple changes (RPPs):**
```javascript
const actions = [];
actions.push(...);
W.model.actionManager.add(new MultiAction(actions));  // One undo/redo step!
```

---

## 📖 File Reference Guide

| File | Size | Purpose | When to Use |
|------|------|---------|-------------|
| WME-API-GUIDE.md | Guide | Complete API reference | Learning API basics |
| WME-SCRIPTS-ANALYSIS.md | Guide | Pattern comparison | Understanding best practices |
| QUICK-REFERENCE.md | Cheat Sheet | Copy/paste snippets | While coding |
| wme-api-discovery.js | Tool | API scanner | Finding new functions |
| console-discovery-snippets.js | Tool | Quick exploration | Testing in console |
| *.user.js | Scripts | Real examples | Learning by example |
| CLAUDE.md | Reference | Place Harmonizer details | Deep dive on PH |

---

## 💡 Pro Tips

1. **Always test in beta first:** https://beta.waze.com/editor
2. **Use browser DevTools:** F12 → Console to test snippets
3. **Check for errors:** Look in Console for red error messages
4. **Start small:** Get one feature working before adding more
5. **Clone arrays:** Always use `[...array]` before modifying
6. **Use MultiAction:** Group related changes together
7. **Study working code:** The downloaded scripts are your best teachers

---

## 🆘 Troubleshooting

**Script not loading?**
- Check Tampermonkey is enabled
- Check script matches WME URL pattern
- Look for errors in browser console (F12)

**Changes not saving?**
- You're probably not using `actionManager.add()`
- See WME-SCRIPTS-ANALYSIS.md → Section 13: Common Mistakes

**Can't find a function?**
- Run wme-api-discovery.js
- Search the generated JSON/TXT files
- Check WME-API-GUIDE.md

**Not sure how to do something?**
- Search WME-SCRIPTS-ANALYSIS.md for the pattern
- Look at how the downloaded scripts do it
- Use console-discovery-snippets.js to explore

---

## 🎯 Next Steps

1. ✅ Scripts downloaded
2. ✅ Documentation created
3. ✅ Analysis complete
4. ⏭️ Start building your own script!

**Recommended First Project:**
Create a simple RPP cleaner script using the pattern from QUICK-REFERENCE.md. It's the perfect way to learn the essential UpdateObject + MultiAction pattern.

---

## 📝 Additional Resources

- **GreasyFork:** https://greasyfork.org/en/scripts?q=wme
- **Waze Forum:** https://www.waze.com/forum/viewforum.php?f=819
- **WME Discord:** Ask in #dev-scripts channel

---

## 🙏 Credits

All downloaded scripts are licensed under their respective licenses (mostly GPL). Special thanks to the WME scripting community for sharing their knowledge through open-source code.

**Script Authors:**
- WME Place Harmonizer: WMEPH Development Group
- WME Fix UI: Memorial Edition team
- WME GIS Layers: Various contributors
- WME HN NavPoints: dBsooner
- WME Norm Name: Various contributors
- WME Place Interface Enhancements: Various contributors
- WME Quick HN: daveacincy
- WME SpeedHelper: Various contributors
- WME WazeBar: Various contributors

---

## 📅 Last Updated

Generated: November 15, 2025

**Note:** WME's API can change. If something stops working, check the GreasyFork pages for updated versions of the scripts.
