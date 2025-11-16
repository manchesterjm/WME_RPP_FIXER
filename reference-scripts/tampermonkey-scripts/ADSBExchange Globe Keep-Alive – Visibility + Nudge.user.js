// ==UserScript==
// @name        ADSBExchange Globe Keep-Alive – Visibility + Nudge
// @match       https://globe.adsbexchange.com/*
// @grant       none
// @run-at      document-start
// ==/UserScript==

(function(){
  'use strict';

  // 1) Override Page Visibility & focus APIs
  Object.defineProperty(document, 'hidden', {
    get: () => false
  });
  Object.defineProperty(document, 'visibilityState', {
    get: () => 'visible'
  });
  document.hasFocus = () => true;

  // 2) Once the map loads, schedule regular nudges
  window.addEventListener('load', () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    function nudge() {
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width  / 2;
      const y = rect.top  + rect.height / 2;

      // pointermove
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true,
        clientX: x, clientY: y,
        pointerType: 'mouse', isPrimary: true
      }));

      // tiny wheel up/down
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true,
        deltaY: 2
      }));
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true,
        deltaY: -2
      }));

      // arrow-key left/right (map will pan imperceptibly)
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true
      }));
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true
      }));
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight', code: 'ArrowRight', bubbles: true
      }));
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'ArrowRight', code: 'ArrowRight', bubbles: true
      }));
    }

    // initial nudge after 5s, then every 30s
    setTimeout(nudge, 5000);
    setInterval(nudge, 30 * 1000);
  });
})();
