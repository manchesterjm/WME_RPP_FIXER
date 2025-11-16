// ==UserScript==
// @name        ApexHosting Keep-Alive
// @match       https://panel.apexminecrafthosting.com/*
// @grant       none
// ==/UserScript==
(function(){
  'use strict';
  // every 4 minutes (240 000 ms), fire a tiny mousemove event
  setInterval(() => {
    const evt = new MouseEvent('mousemove', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0
    });
    document.dispatchEvent(evt);
  }, 240 * 1000);
})();
