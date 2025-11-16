# How to Install WME Scripts in Tampermonkey

## Quick Install Methods

### Method 1: Drag & Drop (Recommended - Easiest!)

1. Open Tampermonkey dashboard
   - Click the Tampermonkey extension icon in your browser
   - Click "Dashboard"

2. Click the "Utilities" tab

3. Find the "Import from file" section

4. Drag `wme-api-discovery.js` from your desktop and drop it there

5. Click "Install" when prompted

✅ Done!

---

### Method 2: Open File in Browser

1. In your browser, press `Ctrl+O` (Windows) or `Cmd+O` (Mac)
   - Or go to File → Open File

2. Navigate to: `C:\Users\manch\Desktop\WME\wme-api-discovery.js`

3. Select the file and click "Open"

4. Tampermonkey will detect the script and show an install page

5. Click "Install"

✅ Done!

---

### Method 3: File Import in Tampermonkey

1. Open Tampermonkey Dashboard

2. Click the "Utilities" tab

3. Scroll to "Import from file"

4. Click "Choose File"

5. Browse to `wme-api-discovery.js` and select it

6. The script will be imported automatically

✅ Done!

---

### Method 4: Manual Copy/Paste (Last Resort)

1. Open Tampermonkey Dashboard

2. Click the "+" icon (Create a new script)

3. Delete all the template code

4. Open `wme-api-discovery.js` in a text editor

5. Copy all the code (Ctrl+A, then Ctrl+C)

6. Paste into Tampermonkey (Ctrl+V)

7. Click File → Save (or Ctrl+S)

✅ Done!

---

## Installing from GitHub (For Easy Updates)

If you want to host your script on GitHub for automatic updates:

### Step 1: Upload to GitHub

1. Create a new repository on GitHub

2. Upload `wme-api-discovery.js` to the repo

3. Go to the file on GitHub

4. Click the "Raw" button

5. Copy the URL (it will look like):
   ```
   https://raw.githubusercontent.com/yourusername/yourrepo/main/wme-api-discovery.js
   ```

### Step 2: Add Update URLs to Script

Edit the script header to add these lines:

```javascript
// ==UserScript==
// @name         WME API Discovery Tool
// @namespace    WMEDiscovery
// @version      1.0.0
// @description  Discovers and catalogues all available WME API functions
// @author       Your Name
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @downloadURL  https://raw.githubusercontent.com/USERNAME/REPO/main/wme-api-discovery.js
// @updateURL    https://raw.githubusercontent.com/USERNAME/REPO/main/wme-api-discovery.js
// @grant        none
// ==/UserScript==
```

### Step 3: Install from URL

In Tampermonkey Dashboard → Utilities → Install from URL, paste the raw GitHub URL.

Now Tampermonkey will auto-check for updates!

---

## Installing on GreasyFork (Public Distribution)

If you want to share your script publicly:

1. Go to https://greasyfork.org

2. Sign up/Login

3. Click "Upload a script"

4. Paste your script code or upload the file

5. Fill in the details and publish

6. Share the GreasyFork URL with others

Users can install with one click from GreasyFork!

---

## Verifying Installation

After installing, verify it worked:

1. Open Tampermonkey Dashboard

2. Look for "WME API Discovery Tool" in the list

3. Make sure the toggle switch is ON (green)

4. Go to https://www.waze.com/editor

5. You should see a green "🔍 Discover WME API" button on the right side

---

## Troubleshooting

### Script not showing up?

- Make sure the file has `.js` extension
- Check that Tampermonkey is enabled
- Try refreshing the WME page

### Button not appearing in WME?

- Check browser console for errors (F12)
- Make sure the script is enabled in Tampermonkey
- Verify the @include pattern matches the WME URL

### Permission errors?

- Check that @grant is set correctly
- Try @grant none for basic scripts
- For advanced features, use @grant GM_xmlhttpRequest, etc.

---

## Quick Reference: File Locations

Your scripts are located at:
```
C:\Users\manch\Desktop\WME\wme-api-discovery.js
C:\Users\manch\Desktop\WME\console-discovery-snippets.js
C:\Users\manch\Desktop\WME\WME-API-GUIDE.md
```

The `.js` files are installable in Tampermonkey.
The `.md` file is documentation (read in any text editor or Markdown viewer).
