# How to Export Your Tampermonkey Scripts

## Quick Check - See What's Installed

1. Click the Tampermonkey icon in your browser
2. Click "Dashboard"
3. You'll see a list of all installed scripts

## Export All Scripts (So Claude can analyze them)

### Method 1: Export as ZIP

1. Open Tampermonkey Dashboard
2. Click the "Utilities" tab
3. Scroll to "Backup"
4. Click "Export to file"
5. Choose "Export to zip"
6. Save to `C:\Users\manch\Desktop\WME\tampermonkey-backup.zip`

Then tell Claude you've saved it and he can extract and analyze them.

### Method 2: Manual List

Just tell Claude which scripts you see in the dashboard:
- Script name
- Version
- Enabled/Disabled status

## Find Tampermonkey Storage (Alternative)

Tampermonkey stores data in your browser profile:

**Chrome/Edge:**
```
%LOCALAPPDATA%\Google\Chrome\User Data\Default\Local Extension Settings\[extension-id]
```

**Firefox:**
```
%APPDATA%\Mozilla\Firefox\Profiles\[profile-name]\storage\default\moz-extension+++[uuid]
```

But these are binary databases that need extraction tools.

## Easiest Way

Just tell me what you see in your Tampermonkey Dashboard and I can:
- Compare with what we've downloaded
- Identify which are already installed
- Help you decide what else to install
- Avoid duplicates
