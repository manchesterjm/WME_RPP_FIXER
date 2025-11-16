# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the WME Place Harmonizer (WMEPH), a UserScript for the Waze Map Editor that harmonizes, formats, and locks places according to standardized guidelines. The script integrates with the Waze Map Editor web interface and provides automated assistance for place editing.

**Current Version**: 2025.01.13.000 (Beta)

## Core Architecture

### Main Components

1. **PNH (Place Name Harmonization) System**
   - `Pnh` class: Manages downloading and processing of place harmonization data from Google Sheets
   - `PnhEntry` class: Represents individual place entries with rules for harmonization
   - `PnhCategoryInfos` class: Manages category metadata and lookup
   - Data is fetched from a Google Spreadsheet (ID: `1pBz4l4cNapyGyzfMJKqA4ePEFLkmz2RryAt1UV39B4g`)
   - Supports USA and Canada (`PNH_DATA.USA`, `PNH_DATA.CAN`)

2. **Geography/Region Management**
   - `Country` class: Contains country-level data (country code, name, category infos, PNH entries, regions)
   - `Region` class: Handles regional form submissions and approval workflows
   - Regions manage localized rules for place approval and chain requests

3. **Flag System** (Quality Assurance)
   - `FlagBase`: Abstract base class for all flags
   - `ActionFlag`: Flags that provide user action buttons
   - `WLFlag`: Flags that can be whitelisted
   - `WLActionFlag`: Combines action and whitelist capabilities
   - `FlagContainer`: Manages collection of flags for a venue
   - Flags indicate issues with places (e.g., missing phone/URL, incorrect categories, locked status)

4. **Harmonization Engine**
   - `harmonizePlace()`: Main entry point for harmonizing a selected venue
   - `harmonizePlaceGo()`: Core harmonization logic
   - `HarmonizationArgs` class: Encapsulates all data needed for harmonization decisions
   - Applies rules from PNH data to standardize place names, categories, attributes, services, etc.

5. **User Interface**
   - Banner system (`_buttonBanner2`, `_servicesBanner`, `_dupeBanner`) for displaying controls
   - Field highlighting system (`UPDATED_FIELDS`) to show which fields were modified
   - Service button management for toggling place services
   - Web search integration for external validation

6. **Whitelist System**
   - Stores user-specific exceptions to harmonization rules
   - Persisted to local storage (compressed with LZString)
   - Keys: `WL_LOCAL_STORE_NAME`, `WL_LOCAL_STORE_NAME_COMPRESSED`

7. **Duplicate Detection**
   - Identifies nearby duplicate places
   - Uses custom layer (`_dupeLayer`) for visualization
   - House number range checking for address conflicts

8. **Highlighting System**
   - Color-coded visual indicators on map for various place statuses
   - Filter highlights for missing customer parking
   - Bootstrap initialization via `bootstrapWmephColorHighlights()`

### Key Data Structures

- **CAT**: Enum of category IDs (e.g., `CAT.GAS_STATION`, `CAT.HOSPITAL`)
- **SEVERITY**: Flag severity levels (`GREEN`, `BLUE`, `YELLOW`, `RED`, `ORANGE`)
- **EV_PAYMENT_METHOD**: Electric vehicle charging payment methods
- **COMMON_EV_PAYMENT_METHODS**: Mapping of EV networks to accepted payment types
- **TITLECASE_SETTINGS**: Rules for proper capitalization (ignore words, cap words, special words)
- **UPDATED_FIELDS**: Tracks which venue fields have been modified with selectors and shadow DOM paths

### Bootstrap Flow

1. `bootstrap()`: Entry point, checks for multiple instances
2. `Pnh.downloadAllData()`: Fetches harmonization data from Google Sheets
3. `placeHarmonizerBootstrap()`: Waits for WME and WazeWrap to be ready
4. `placeHarmizerInit()`: Initializes UI, event handlers, and features

## Dependencies

External libraries loaded via `@require`:
- **WazeWrap**: Waze editor wrapper library for common operations
- **HoursParser**: Utility for parsing opening hours
- **lz-string**: Compression library for local storage
- **turf.js**: Geospatial analysis library

Global objects from WME:
- `W`: Main Waze editor object
- `OpenLayers`: Mapping library
- `I18n`: Internationalization

## Key Functions

### Place Operations
- `getSelectedVenue()`: Returns currently selected venue
- `harmonizePlace()`: Main harmonization trigger
- `addUpdateAction(venue, newAttributes, actions, ...)`: Queues venue updates
- `executeMultiAction(actions)`: Executes batch of venue changes
- `nudgeVenue(venue)`: Slightly moves venue geometry to trigger save

### Name Processing
- `titleCase(str)`: Applies title case rules per `TITLECASE_SETTINGS`
- `getNameParts(name)`: Splits name at hyphens/parentheses

### Validation
- `normalizePhone(s, outputFormat)`: Formats phone numbers
- `normalizeURL(url, makeLowerCase)`: Cleans and validates URLs
- `getPvaSeverity(pvaValue, venue)`: Determines parking visibility severity

### Utilities
- `errorHandler(callback, ...args)`: Wraps functions with try/catch
- `log(...args)`: Logging (always enabled)
- `logDev(...args)`: Development logging (beta users only)
- `saveWhitelistToLS(compress)` / `loadWhitelistFromLS(decompress)`: Whitelist persistence

## Development Notes

### Script Variants
- Production version: `WME Place Harmonizer`
- Beta version: `WME Place Harmonizer Beta`
- Determined by `IS_BETA_VERSION` constant (checks for "Beta" in script name)
- Beta features are restricted to approved users in `_wmephBetaList`

### User Management
- `USER` object tracks current user rank, name, beta/dev status
- `_wmephDevList`: List of development users (additional debug features)
- `_wmephBetaList`: List of beta testers

### Caching
- `_resultsCache`: Stores harmonization results to reduce reprocessing
- `MAX_CACHE_SIZE`: 25,000 entries

### Keyboard Shortcuts
- `SHORTCUT` object manages keyboard event handling
- Default modifier key: `Alt+` (stored in `_modifKey`)

### Field Update Tracking
The `UPDATED_FIELDS` object contains selectors for each editable field, supporting both regular and shadow DOM elements:
- `selector`: CSS selector for the field
- `shadowSelector`: Optional selector within shadow root
- `tab`: Which tab the field appears in ('general' or 'more-info')
- `updated`: Boolean tracking if field was modified

## Important Constants

- `SCRIPT_VERSION`: Pulled from UserScript header
- `SCRIPT_NAME`: Script display name
- `_SCRIPT_UPDATE_MESSAGE`: Message shown on updates (set to null for release)
- `WME_SERVICES_ARRAY`: List of supported place services
- `FEEDS_TO_SKIP`: External data feeds safe to delete (regex array)

## Special Behaviors

### Category-Specific Logic
- Certain categories don't require phone/URL (see `PRIMARY_CATS_TO_IGNORE_MISSING_PHONE_URL`)
- Some categories get green flags for missing phone/URL instead of warnings
- Rest areas and other categories have regional requirements (`REGIONS_THAT_WANT_PLA_PHONE_URL`)
- Categories that don't need names: `CATS_THAT_DONT_NEED_NAMES`

### Lock Level Determination
- Default lock levels are region/state-specific
- Certain flags prevent locking (`noLock` property)
- Severity affects lock decisions

### Abbreviation Handling
- College abbreviations preserved in title case (see `COLLEGE_ABBREVIATIONS`)
- Special capitalization rules in `TITLECASE_SETTINGS.capWords`
- Special word patterns in `TITLECASE_SETTINGS.specWords`

## File Structure

This is a single-file UserScript (`wme.txt`):
- Lines 1-17: UserScript metadata
- Lines 19-27: Global declarations
- Lines 30-10153: Main IIFE containing all code
  - Lines 194-289: `Country` and `Region` classes
  - Lines 791-812: `PnhCategoryInfos` class
  - Lines 813-1401: `PnhEntry` class
  - Lines 1403-1787: `Pnh` class (data management)
  - Lines 3038-3130: Flag base classes
  - Lines 3131+: Specific flag implementations
  - Lines 6323+: `FlagContainer` class
  - Lines 6829+: `HarmonizationArgs` class
  - End section: Bootstrap and initialization functions

## Testing

The script checks for username 'MapOMatic' and enables special debug features:
- Exposes `PNH_DATA` to `unsafeWindow`
- Exposes `WMEPH_FLAG` to `unsafeWindow`

## Notes for AI Assistants

- This is a UserScript, not a standalone application. It runs in the browser context of waze.com/editor
- The script modifies the Waze Map Editor UI and intercepts/enhances place editing workflows
- When making changes, be careful with selectors (including shadow DOM selectors) as WME UI changes can break functionality
- The PNH data is the source of truth for place standards - changes to harmonization logic should respect PNH entries
- The flag system is extensible - new flag types should extend `ActionFlag`, `WLFlag`, or `WLActionFlag`
