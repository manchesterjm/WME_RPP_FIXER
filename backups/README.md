# WME RPP Auto-Fixer - Version Backups

This folder contains backup copies of every version of the WME RPP Auto-Fixer script.

## Backup Policy

- **Every new version** is backed up before changes are made
- **All backups are kept** - no overwrites
- **Naming convention**: `wme-rpp-auto-fixer-v{VERSION}.user.js`
- **Git tracked**: All backups are committed to version control

## Current Backups

| Version | Date | Description |
|---------|------|-------------|
| 3.10.2  | 2025-11-16 | Scan zoom level 19 (restored) |

## How to Use Backups

To restore a previous version:
1. Copy the desired backup file
2. Rename it to `wme-rpp-auto-fixer.user.js`
3. Replace the main script file
4. Reinstall in Tampermonkey if needed

## Backup Process

When creating a new version:
1. Copy current version to `backups/wme-rpp-auto-fixer-v{CURRENT_VERSION}.user.js`
2. Make changes to main file
3. Update version number in main file
4. Commit both files to git

This ensures we can always roll back to any previous version if needed.
