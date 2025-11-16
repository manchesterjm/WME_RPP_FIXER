// ==UserScript==
// @name         WME API Discovery Tool
// @namespace    WMEDiscovery
// @version      1.0.0
// @description  Discovers and catalogues all available WME API functions, classes, and objects
// @author       Your Name
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Wait for WME to be ready
    function waitForWME() {
        return new Promise(resolve => {
            function check() {
                if (typeof W !== 'undefined' && W.map && W.model) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            }
            check();
        });
    }

    // Recursively explore object properties
    function exploreObject(obj, path = '', maxDepth = 3, currentDepth = 0, visited = new WeakSet()) {
        const results = {
            functions: [],
            classes: [],
            objects: [],
            properties: []
        };

        if (currentDepth >= maxDepth || !obj || typeof obj !== 'object') {
            return results;
        }

        // Avoid circular references
        if (visited.has(obj)) {
            return results;
        }
        visited.add(obj);

        try {
            const props = Object.getOwnPropertyNames(obj);

            for (const prop of props) {
                // Skip private/internal properties
                if (prop.startsWith('_') || prop.startsWith('$')) {
                    continue;
                }

                const fullPath = path ? `${path}.${prop}` : prop;

                try {
                    const value = obj[prop];
                    const type = typeof value;

                    if (type === 'function') {
                        // Check if it's a class (constructor)
                        const isClass = /^class\s/.test(Function.prototype.toString.call(value)) ||
                                       value.prototype && value.prototype.constructor === value;

                        if (isClass) {
                            results.classes.push({
                                path: fullPath,
                                name: prop,
                                methods: Object.getOwnPropertyNames(value.prototype).filter(m => m !== 'constructor')
                            });
                        } else {
                            results.functions.push({
                                path: fullPath,
                                name: prop,
                                params: getFunctionParams(value)
                            });
                        }
                    } else if (type === 'object' && value !== null) {
                        results.objects.push({
                            path: fullPath,
                            name: prop,
                            type: Array.isArray(value) ? 'array' : 'object'
                        });

                        // Recurse into objects
                        if (currentDepth < maxDepth - 1) {
                            const nested = exploreObject(value, fullPath, maxDepth, currentDepth + 1, visited);
                            results.functions.push(...nested.functions);
                            results.classes.push(...nested.classes);
                            results.objects.push(...nested.objects);
                            results.properties.push(...nested.properties);
                        }
                    } else {
                        results.properties.push({
                            path: fullPath,
                            name: prop,
                            type: type,
                            value: type === 'string' || type === 'number' || type === 'boolean' ? value : undefined
                        });
                    }
                } catch (e) {
                    // Skip properties that throw errors on access
                }
            }
        } catch (e) {
            console.error('Error exploring object:', path, e);
        }

        return results;
    }

    // Extract function parameter names
    function getFunctionParams(func) {
        const funcStr = func.toString();
        const match = funcStr.match(/\(([^)]*)\)/);
        if (match && match[1]) {
            return match[1].split(',').map(p => p.trim()).filter(p => p);
        }
        return [];
    }

    // Discover require() modules
    function discoverRequireModules() {
        const commonPaths = [
            'Waze/Action/AddLandmark',
            'Waze/Action/DeleteObject',
            'Waze/Action/ModifyNode',
            'Waze/Action/MultiAction',
            'Waze/Action/UpdateFeatureAddress',
            'Waze/Action/UpdateFeatureGeometry',
            'Waze/Action/UpdateObject',
            'Waze/Action/UpdateSegmentAddress',
            'Waze/Action/UpdateSegmentGeometry',
            'Waze/Action/UpdateSegmentProperties',
            'Waze/Model/Objects/OpeningHour',
            'Waze/Model/Objects/Venue',
            'Waze/Model/Objects/Segment',
            'Waze/Model/Objects/Node',
            'Waze/Feature/Vector/Landmark',
            'Waze/Feature/Vector/Segment',
            'Waze/Controller/VenueController',
            'Waze/Controller/SegmentController'
        ];

        const modules = {};

        commonPaths.forEach(path => {
            try {
                const module = require(path);
                modules[path] = {
                    exists: true,
                    type: typeof module,
                    isClass: typeof module === 'function',
                    properties: typeof module === 'object' ? Object.keys(module) : []
                };
            } catch (e) {
                modules[path] = {
                    exists: false,
                    error: e.message
                };
            }
        });

        return modules;
    }

    // Main discovery function
    async function discoverWMEAPI() {
        console.log('🔍 Starting WME API Discovery...');

        await waitForWME();

        console.log('✅ WME is ready. Analyzing API...');

        const discovery = {
            timestamp: new Date().toISOString(),
            wmeVersion: W.app?.version || 'unknown',

            // Explore W object
            W: exploreObject(W, 'W', 3),

            // Explore model
            model: exploreObject(W.model, 'W.model', 4),

            // Explore controllers
            controllers: exploreObject(W.controller, 'W.controller', 3),

            // Explore map
            map: exploreObject(W.map, 'W.map', 3),

            // Explore action manager
            actionManager: exploreObject(W.model?.actionManager, 'W.model.actionManager', 3),

            // Explore selectionManager
            selectionManager: exploreObject(W.selectionManager, 'W.selectionManager', 3),

            // Require modules
            requireModules: discoverRequireModules()
        };

        return discovery;
    }

    // Format results for display
    function formatResults(discovery) {
        let output = '=== WME API DISCOVERY RESULTS ===\n\n';
        output += `Timestamp: ${discovery.timestamp}\n`;
        output += `WME Version: ${discovery.wmeVersion}\n\n`;

        // Format each section
        ['W', 'model', 'controllers', 'map', 'actionManager', 'selectionManager'].forEach(section => {
            const data = discovery[section];
            if (!data) {
                return;
            }

            output += `\n=== ${section.toUpperCase()} ===\n`;

            if (data.classes.length > 0) {
                output += `\nClasses (${data.classes.length}):\n`;
                data.classes.forEach(cls => {
                    output += `  ${cls.path}\n`;
                    if (cls.methods.length > 0) {
                        output += `    Methods: ${cls.methods.join(', ')}\n`;
                    }
                });
            }

            if (data.functions.length > 0) {
                output += `\nFunctions (${data.functions.length}):\n`;
                data.functions.slice(0, 50).forEach(fn => {
                    const params = fn.params.length > 0 ? `(${fn.params.join(', ')})` : '()';
                    output += `  ${fn.path}${params}\n`;
                });
                if (data.functions.length > 50) {
                    output += `  ... and ${data.functions.length - 50} more\n`;
                }
            }

            if (data.objects.length > 0) {
                output += `\nObjects (${data.objects.length}):\n`;
                data.objects.slice(0, 30).forEach(obj => {
                    output += `  ${obj.path} [${obj.type}]\n`;
                });
                if (data.objects.length > 30) {
                    output += `  ... and ${data.objects.length - 30} more\n`;
                }
            }
        });

        // Require modules
        output += '\n\n=== REQUIRE MODULES ===\n';
        Object.entries(discovery.requireModules).forEach(([path, info]) => {
            if (info.exists) {
                output += `✓ ${path} [${info.type}]\n`;
                if (info.properties.length > 0) {
                    output += `    Properties: ${info.properties.join(', ')}\n`;
                }
            } else {
                output += `✗ ${path} - ${info.error}\n`;
            }
        });

        return output;
    }

    // Download results as file
    function downloadResults(data, filename) {
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Create UI button
    function createUI() {
        const button = document.createElement('button');
        button.textContent = '🔍 Discover WME API';
        button.style.cssText = `
            position: fixed;
            top: 100px;
            right: 10px;
            z-index: 10000;
            padding: 10px 15px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        `;

        button.onclick = async () => {
            button.textContent = '⏳ Discovering...';
            button.disabled = true;

            try {
                const results = await discoverWMEAPI();

                // Log to console
                console.log('WME API Discovery Results:', results);

                // Format and display
                const formatted = formatResults(results);
                console.log(formatted);

                // Download JSON
                downloadResults(JSON.stringify(results, null, 2), 'wme-api-discovery.json');

                // Download formatted text
                downloadResults(formatted, 'wme-api-discovery.txt');

                alert('✅ Discovery complete!\nCheck console and downloads folder for results.');

                // Make results available globally
                window.WME_API_DISCOVERY = results;
                console.log('💡 Results also available at: window.WME_API_DISCOVERY');

            } catch (error) {
                console.error('Discovery error:', error);
                alert('❌ Discovery failed. Check console for details.');
            } finally {
                button.textContent = '🔍 Discover WME API';
                button.disabled = false;
            }
        };

        document.body.appendChild(button);
    }

    // Initialize
    waitForWME().then(() => {
        console.log('WME API Discovery Tool loaded. Creating UI...');
        createUI();

        // Also expose the discovery function globally
        window.discoverWMEAPI = discoverWMEAPI;
        console.log('💡 You can also run discovery manually: await discoverWMEAPI()');
    });

})();
