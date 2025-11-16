# JavaScript/Userscript Style Guide

**WME RPP Auto-Fixer - Coding Standards**

**Version**: 1.0
**Last Updated**: November 16, 2025
**Status**: Active

This document defines the coding standards for all JavaScript code in the WME userscript project. These principles are adapted from Python/Django best practices and tailored for JavaScript development.

---

## Table of Contents

1. [General Principles](#general-principles)
2. [SOFA Principles (MANDATORY)](#sofa-principles-mandatory)
3. [JavaScript Style](#javascript-style)
4. [Naming Conventions](#naming-conventions)
5. [Code Organization](#code-organization)
6. [Functions](#functions)
7. [Documentation](#documentation)
8. [Error Handling](#error-handling)
9. [Constants and Magic Numbers](#constants-and-magic-numbers)
10. [Code Review Checklist](#code-review-checklist)

---

## General Principles

### Core Values
1. **Readability First**: Code is read more often than written
2. **Explicit is Better Than Implicit**: Clear over clever
3. **Consistency**: Follow existing patterns in the codebase
4. **DRY (Don't Repeat Yourself)**: Extract common functionality
5. **YAGNI (You Aren't Gonna Need It)**: Don't build for hypothetical futures
6. **Separation of Concerns**: Each component should have a single responsibility

### Code Quality Standards
- **All Functions Documented**: JSDoc comments required
- **No Console Warnings**: Address all warnings before committing
- **Consistent Style**: Follow this guide throughout

---

## SOFA Principles (MANDATORY)

**SOFA** = **S**ingle Responsibility, **O**pen/Closed, **F**unction Extraction, **A**void Repetition

All code must follow SOFA principles when writing new code AND when refactoring existing code.

### 1. Single Responsibility Principle (SRP)
Each function should have ONE clear purpose.

```javascript
// ❌ BAD: Function doing too much
function processRPP(rpp) {
    // Mixing validation, fixing, and UI update!
    if (!rpp.attributes.entryExitPoints?.length) {
        const point = rpp.getOLGeometry().getCentroid();
        const geoJSONPoint = W.userscripts.toGeoJSONGeometry(point);
        const navPoint = new NavigationPoint(geoJSONPoint);
        W.model.actionManager.add(new UpdateObject(rpp, {
            entryExitPoints: [navPoint]
        }));
    }
    if (rpp.attributes.lockRank < 2) {
        W.model.actionManager.add(new UpdateObject(rpp, {
            lockRank: 2
        }));
    }
    sessionStats.totalFixed++;
    displayUI(0);
}

// ✅ GOOD: Separated concerns
function processRPP(rpp) {
    const fixes = analyzeRPP(rpp);
    if (fixes.needsAnyFix) {
        applyFixes(rpp, fixes);
        trackFixedRPP(rpp.attributes.id);
    }
}

function analyzeRPP(rpp) {
    return {
        needsEntryPoint: !rpp.attributes.entryExitPoints?.length,
        needsLockFix: rpp.attributes.lockRank < 2,
        needsAnyFix: function() {
            return this.needsEntryPoint || this.needsLockFix;
        }
    };
}
```

### 2. Open/Closed Principle
Design for extension, not modification.

```javascript
// ✅ GOOD: Extensible calculator design
class RPPFixCalculator {
    calculateXP(correct, total) {
        throw new Error('Must be implemented by subclass');
    }
}

class StandardRPPCalculator extends RPPFixCalculator {
    calculateXP(correct, total) {
        return Math.floor((correct / total) * 100);
    }
}

class BonusRPPCalculator extends RPPFixCalculator {
    calculateXP(correct, total) {
        const base = Math.floor((correct / total) * 100);
        return correct === total ? base * 2 : base;
    }
}
```

### 3. Function Extraction
Extract complex logic into helper functions. Keep functions focused and short.

```javascript
// ❌ BAD: Large function doing too much
function scanAndFixRPPs() {
    const allRPPs = W.model.venues.getObjectArray().filter(v => {
        return v.attributes?.categories?.includes("RESIDENCE_HOME");
    });

    // 20 lines of fixing logic...
    allRPPs.forEach(rpp => {
        const venueId = rpp.attributes.id;
        if (sessionStats.fixedVenueIds.has(venueId)) return;

        const needsEntryPoint = !rpp.attributes.entryExitPoints?.length;
        const needsLockFix = rpp.attributes.lockRank < 2;

        if (needsEntryPoint || needsLockFix) {
            // ... more logic
        }
    });

    displayUI(allRPPs.length);
}

// ✅ GOOD: Extracted into focused functions
function scanAndFixRPPs() {
    const allRPPs = getRPPsInView();
    const newFixes = autoFixRPPs(allRPPs);
    updateStats(newFixes);
    displayUI(allRPPs.length);
}

function getRPPsInView() {
    return W.model.venues.getObjectArray().filter(venue => {
        return venue.attributes?.categories?.includes("RESIDENCE_HOME");
    });
}

function autoFixRPPs(rpps) {
    let fixedCount = 0;
    rpps.forEach(rpp => {
        if (shouldFixRPP(rpp)) {
            fixRPP(rpp);
            fixedCount++;
        }
    });
    return fixedCount;
}
```

### 4. Avoid Repetition (DRY)
Never copy-paste code. Extract common patterns.

```javascript
// ❌ BAD: Repeated progress calculation
function getWeeklyProgress() {
    const total = scannerState.totalRows * scannerState.totalCols;
    const completed = scannerState.currentRow * scannerState.totalCols + scannerState.currentCol;
    return (completed / total * 100).toFixed(1);
}

function getMonthlyProgress() {
    const total = scannerState.totalRows * scannerState.totalCols;
    const completed = scannerState.currentRow * scannerState.totalCols + scannerState.currentCol;
    return (completed / total * 100).toFixed(1);  // DUPLICATE!
}

// ✅ GOOD: Extracted helper function
function calculateProgress(currentRow, currentCol, totalRows, totalCols) {
    const total = totalRows * totalCols;
    const completed = currentRow * totalCols + currentCol;
    return (completed / total * 100).toFixed(1);
}

function getWeeklyProgress() {
    return calculateProgress(
        scannerState.currentRow,
        scannerState.currentCol,
        scannerState.totalRows,
        scannerState.totalCols
    );
}
```

### SOFA Refactoring Checklist
Before committing code, verify:

- [ ] **Single Responsibility**: Does each function have ONE clear purpose?
- [ ] **Function Length**: Are functions under 50 lines?
- [ ] **No Duplication**: Is there any copy-pasted code?
- [ ] **Helper Functions**: Are complex calculations extracted?
- [ ] **Magic Numbers**: Are literal numbers replaced with named constants?
- [ ] **Extensibility**: Can this be extended without modification?

---

## JavaScript Style

### Line Length
```javascript
// Maximum line length: 120 characters
// Break long lines appropriately

// BAD: Line too long
console.log("This is a very long message that exceeds the maximum line length and should be broken into multiple lines for better readability");

// GOOD: Line broken appropriately
console.log(
    "This is a very long message that has been broken " +
    "into multiple lines for better readability"
);
```

### Indentation
```javascript
// Use 4 spaces per indentation level (matches existing code)

// GOOD
function calculateTotal(items) {
    let total = 0;
    for (const item of items) {
        if (item.isValid) {
            total += item.price;
        }
    }
    return total;
}
```

### Blank Lines
```javascript
// Two blank lines between major sections (classes, major function groups)

// One blank line between functions
function firstFunction() {
    // ...
}

function secondFunction() {
    // ...
}


// Use blank lines sparingly inside functions to show logical sections
function complexFunction() {
    // Setup
    const data = fetchData();

    // Processing
    const processed = transform(data);

    // Return
    return processed;
}
```

### Const, Let, Var
```javascript
// Use const by default
const MAX_ATTEMPTS = 5;
const user = getUserData();

// Use let when reassignment needed
let counter = 0;
counter++;

// Never use var (use let instead)
// BAD: var x = 10;
// GOOD: let x = 10;
```

---

## Naming Conventions

### General Rules
```javascript
// Variables and functions: camelCase
const userCount = 10;
function getUserProfile() {
    // ...
}

// Classes: PascalCase
class UserProfile {
    // ...
}

class NavigationPoint {
    // ...
}

// Constants: UPPERCASE_WITH_UNDERSCORES
const MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_TIMEOUT = 300;
const SCAN_ZOOM = 19;

// "Private" (internal): leading underscore
function _internalHelper() {
    // ...
}

const _internalVariable = "hidden";
```

### Boolean Variables
```javascript
// Use is_, has_, can_, should_ prefixes for booleans
const isActive = true;
const hasPermission = false;
const canEdit = true;
const shouldRetry = false;

// BAD
const active = true;      // Ambiguous
const permission = false; // What does false mean?
```

### Function Names
```javascript
// Use verb-noun pattern for functions
function getRPPs() { }           // GOOD
function calculateTotal() { }    // GOOD
function startScanning() { }     // GOOD

function rpps() { }              // BAD: Not clear what it does
function total() { }             // BAD: Noun only
```

---

## Code Organization

### File Organization
```javascript
// ==UserScript==
// @name         Script Name
// @version      1.0.0
// ...
// ==/UserScript==

/*
 * File header comment explaining purpose
 */

(function() {
    'use strict';

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const MAX_RETRIES = 3;
    const SCAN_ZOOM = 19;

    // ========================================================================
    // CLASSES
    // ========================================================================

    class MyClass {
        // ...
    }

    // ========================================================================
    // STATE
    // ========================================================================

    let globalState = {
        // ...
    };

    // ========================================================================
    // CORE FUNCTIONS
    // ========================================================================

    function mainFunction() {
        // ...
    }

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    function helperFunction() {
        // ...
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    initializeScript();
})();
```

---

## Functions

### Single Return Statement Principle
```javascript
// GOOD: Single return point (when practical)
function calculateDiscount(price, isPremium) {
    // Guard clauses for validation (early returns OK)
    if (price <= 0) {
        return 0;
    }

    // Main logic with single return
    let discount = 0;
    if (isPremium) {
        discount = price * 0.20;
    } else {
        discount = price * 0.10;
    }

    return discount;
}

// ACCEPTABLE: Multiple returns for validation/error cases
function processPayment(amount, user) {
    // Early returns for error conditions
    if (amount <= 0) {
        return { success: false, error: "Invalid amount" };
    }

    if (!user.hasPaymentMethod) {
        return { success: false, error: "No payment method" };
    }

    // Main logic
    const result = chargePayment(amount, user);
    return { success: true, data: result };
}
```

### Function Length
```javascript
// Keep functions focused and concise (generally <50 lines)
// If longer, break into smaller functions

// BAD: Too long, does too many things
function processOrder(order) {
    // 100+ lines of mixed validation, processing, logging...
}

// GOOD: Broken into logical pieces
function processOrder(order) {
    if (!validateOrder(order)) {
        return false;
    }

    updateInventory(order);
    chargeCustomer(order);
    sendConfirmation(order);
    logCompletion(order);

    return true;
}

function validateOrder(order) {
    return order.items && order.customer;
}
```

### Function Arguments
```javascript
// Limit function arguments (≤5 is ideal)

// BAD: Too many arguments
function createVenue(name, address, city, state, zip, lat, lon, category, hours) {
    // ...
}

// GOOD: Group related data into objects
function createVenue(name, location, details) {
    /*
     * Create new venue.
     *
     * @param {string} name - Venue name
     * @param {Object} location - {address, city, state, zip, lat, lon}
     * @param {Object} details - {category, hours}
     */
    // ...
}
```

---

## Documentation

### JSDoc Comments
```javascript
// All public functions must have JSDoc comments

/**
 * Calculate order total with tax and discount
 *
 * @function calculateTotal
 * @param {Array<Object>} items - Array of order items
 * @param {number} taxRate - Tax rate as decimal (default: 0.08)
 * @param {number} discount - Discount amount to subtract
 * @returns {number} Final total amount after tax and discount
 *
 * @example
 * const items = [{price: 10}, {price: 20}];
 * const total = calculateTotal(items, 0.08);
 * // Returns: 32.40
 */
function calculateTotal(items, taxRate = 0.08, discount = 0) {
    // Implementation
}
```

### Inline Comments
```javascript
// Use comments to explain WHY, not WHAT

// BAD: Comment states the obvious
// Increment counter by 1
counter++;

// GOOD: Comment explains reasoning
// Add 1 to account for zero-indexing in display
counter++;

// BAD: Redundant comment
// Get user by ID
const user = getUserById(userId);

// GOOD: Explains business logic
// Only scan at zoom 19 for optimal tile size (smaller = faster loading)
const SCAN_ZOOM = 19;

// Use TODO for future improvements
// TODO: Add pagination when RPP count exceeds 1000
const allRPPs = getAllRPPs();

// Use FIXME for known issues
// FIXME: Race condition possible with rapid clicking
updateCounter();
```

---

## Error Handling

### Try-Catch Blocks
```javascript
// Use specific error handling

// BAD: Silent failures
try {
    processRPP(rpp);
} catch (e) {
    // Silent failure - bad!
}

// GOOD: Log errors with context
try {
    processRPP(rpp);
} catch (err) {
    console.error(`Failed to process RPP ${rpp.attributes.id}:`, err);
    // Optionally: alert user, retry, etc.
}
```

### Validation
```javascript
// Validate early, fail fast

function createOrder(items, customer) {
    // Validation at the top
    if (!items || items.length === 0) {
        throw new Error("Order must contain at least one item");
    }
    if (!customer) {
        throw new Error("Customer is required");
    }
    if (!customer.isActive) {
        throw new Error("Customer account is not active");
    }

    // Main logic after validation
    const order = new Order(customer);
    items.forEach(item => order.addItem(item));
    return order;
}
```

---

## Constants and Magic Numbers

### Extract Magic Numbers
```javascript
// BAD: Magic numbers scattered throughout code
function startScanning() {
    W.map.setCenter(center, 19);  // What is 19?
    setTimeout(doScan, 500);       // Why 500?
}

// GOOD: Named constants at top of file
const SCAN_ZOOM = 19;           // Optimal zoom for small, fast-loading tiles
const SCAN_WAIT_MS = 500;       // Wait time after mergeend event

function startScanning() {
    W.map.setCenter(center, SCAN_ZOOM);
    setTimeout(doScan, SCAN_WAIT_MS);
}
```

### Constant Organization
```javascript
// Group related constants together

// Scanner Configuration
const SCAN_ZOOM = 19;
const SCAN_OVERLAP = 0.1;
const SCAN_WAIT_MS = 500;

// UI Update Throttling
const UI_UPDATE_THROTTLE_MS = 100;

// Scanner States
const STATE_STOPPED = 'stopped';
const STATE_RUNNING = 'running';
const STATE_PAUSED = 'paused';

// Lock Levels (WME uses 0-based indexing, but displays as 1-based)
const LOCK_LEVEL_3 = 2;  // Displayed as "Level 3" in WME UI
```

---

## Code Review Checklist

### Before Committing
- [ ] All functions have JSDoc comments
- [ ] No console.log() debug statements (use console.error/warn if needed)
- [ ] No commented-out code
- [ ] Constants extracted from magic numbers
- [ ] SOFA principles applied
- [ ] Functions are <50 lines (or have good reason to be longer)
- [ ] No duplicate code
- [ ] Error handling is appropriate
- [ ] Code is readable and maintainable

### Reviewing Code
- [ ] Code follows this style guide
- [ ] Function names are descriptive
- [ ] Single Responsibility Principle followed
- [ ] No unnecessary complexity
- [ ] Documentation is clear and complete
- [ ] Error messages are helpful
- [ ] Constants are used instead of magic numbers

---

## Enforcement

### Manual Review
- All code should follow this guide
- Deviations should be documented with comments explaining why
- Major changes should update this guide

---

## Exceptions and Special Cases

### When to Deviate
- **Legacy WME API**: Match WME conventions when interfacing with their API
- **Performance Critical**: Document why standard approach wasn't used
- **Third-Party Integration**: Match external library conventions

### How to Request Exception
1. Document reason in code comments
2. Note in commit message
3. Update this guide if pattern should be standardized

---

## Resources

- [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
- [Clean Code JavaScript](https://github.com/ryanmcdermott/clean-code-javascript)

---

## Changelog

### Version 1.0 (November 16, 2025)
- Initial style guide creation
- Adapted from Python/Django Style Guide
- Focused on SOFA principles
- JavaScript-specific conventions established

---

**Questions or Suggestions?**
This guide is a living document and will evolve with the project.
