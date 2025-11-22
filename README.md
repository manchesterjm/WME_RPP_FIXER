# WME RPP Auto-Fixer

A Tampermonkey userscript that automatically fixes Residential Place Points (RPPs) in Waze Map Editor.

## Current Version: 3.13.4

### Key Features

- **Two Operating Modes**:
  - **Manual Mode**: Pan around the map to scan areas as you navigate
  - **Auto-Scan Mode**: Automated grid scanning with snake pattern for complete area coverage

- **High Performance**:
  - Zoom 19 optimization for ~8x faster scanning
  - Event-driven scanning using mergeend events
  - Auto-pause at 100 changes to prevent editor lag

- **Progress Tracking**:
  - Real-time progress percentage
  - ETA calculation
  - RPP fix counter
  - Scan duration tracking

- **User Interface**:
  - Draggable control panel
  - Clear status indicators
  - Pause/Resume controls
  - Safe stop functionality

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Open `wme-rpp-auto-fixer-v3.13.4.user.js` in this folder
3. Tampermonkey will prompt to install
4. Navigate to [Waze Map Editor](https://www.waze.com/editor)

See [../docs/HOW-TO-INSTALL.md](../docs/HOW-TO-INSTALL.md) for detailed installation instructions.

## Documentation

- **RPP-AUTO-FIXER-GUIDE.md** - Complete user guide and feature documentation
- **SESSION_PROGRESS.md** - Full development history and technical details
- **archive/** - Previous versions and legacy scripts

## Development

### Requirements

- Node.js (for ESLint)
- npm packages (see package.json)

### Code Quality

```bash
npm install
npx eslint wme-rpp-auto-fixer-v3.13.4.user.js
```

Follow conventions in [../STYLE_GUIDE.md](../STYLE_GUIDE.md)

## Version History

| Version | Feature | Status |
|---------|---------|--------|
| 3.13.4 | Auto-reset stats when starting scan (fresh start each scan) | ✅ Current |
| 3.13.3 | CRITICAL FIX: Duplicate UpdateObject bug, changes now appear in save queue | ✅ Stable |
| 3.13.2 | Configurable lock level dropdown (for different states) | ✅ Stable |
| 3.13.1 | Bug fixes: save counter, zoom check, RPP tracking | ✅ Stable |

See SESSION_PROGRESS.md for complete version history.

## Reference Materials

- [WME API Guide](../WME-API-GUIDE.md)
- [WazeWrap Explained](../WAZEWRAP-EXPLAINED.md)
- [Reference Scripts](../reference-scripts/)

## License

This script is provided as-is for Waze editing community use.
