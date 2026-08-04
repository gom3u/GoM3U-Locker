// =====================================================================
// adblock.js — Ad Blocker & DNS-level Ad Blocker Detector (v2, more reliable)
// =====================================================================
// Detects two categories of blocking so users can't skip the ad steps:
//   1. Browser-extension ad blockers (uBlock Origin, AdBlock Plus, etc.)
//      → detected via a "bait" element these extensions hide with CSS,
//        AND via a real ad-script <script> tag load failure.
//   2. DNS-level / network-level ad blocking (Pi-hole, AdGuard DNS,
//      NextDNS, some VPNs/firewalls) → the same <script> tag test
//      catches this too, since a blocked DNS lookup / refused
//      connection fires the tag's onerror event.
//
// NOTE: we use a real <script> tag (not fetch) because most extensions
// intercept it at the network layer and reliably fire onerror — a
// fetch() in no-cors mode can silently "succeed" (opaque response)
// even when the request was actually blocked, causing false negatives.
//
// If either check trips, a full-screen overlay blocks the page until
// the user disables their blocker and clicks "Recheck".
// =====================================================================

(function () {
  const overlay = document.getElementById("adblock-overlay");
  const retryBtn = document.getElementById("adblock-retry-btn");

  function showOverlay() {
    if (overlay) overlay.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function hideOverlay() {
    if (overlay) overlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  // ---- Method 1: bait element (classic extension-based ad blockers) ----
  function checkBaitElement() {
    return new Promise((resolve) => {
      const bait = document.createElement("div");
      // Class names commonly targeted by ad-blocking filter lists
      bait.className =
        "adsbox ad-banner ads ad-placement textads banner_ad adunit";
      bait.style.cssText =
        "position:absolute;top:-9999px;left:-9999px;width:2px;height:2px;";
      document.body.appendChild(bait);

      setTimeout(() => {
        const style = window.getComputedStyle(bait);
        const isBlocked =
          bait.offsetParent === null ||
          bait.offsetHeight === 0 ||
          bait.clientHeight === 0 ||
          style.display === "none" ||
          style.visibility === "hidden";
        bait.remove();
        resolve(isBlocked);
      }, 150);
    });
  }

  // ---- Method 2: real ad-script tag load (catches extensions + DNS blockers) ----
  function checkAdScriptTag() {
    return new Promise((resolve) => {
      let settled = false;
      const script = document.createElement("script");

      const finish = (blocked) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.remove();
        resolve(blocked);
      };

      // If neither onload nor onerror fires within 2.5s (e.g. DNS hang),
      // treat it as blocked.
      const timer = setTimeout(() => finish(true), 2500);

      script.onload = () => finish(false); // script loaded fine → not blocked
      script.onerror = () => finish(true); // blocked by extension or DNS/network

      // Cache-bust so browsers/CDNs don't serve a stale cached result
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?cb=" +
        Date.now();
      script.async = true;
      document.body.appendChild(script);
    });
  }

  async function runDetection() {
    const [baitBlocked, scriptBlocked] = await Promise.all([
      checkBaitElement(),
      checkAdScriptTag(),
    ]);

    if (baitBlocked || scriptBlocked) {
      showOverlay();
    } else {
      hideOverlay();
    }
  }

  document.addEventListener("DOMContentLoaded", runDetection);

  if (retryBtn) {
    retryBtn.addEventListener("click", async () => {
      retryBtn.disabled = true;
      retryBtn.textContent = "Checking…";
      await runDetection();
      retryBtn.disabled = false;
      retryBtn.textContent = "I've Disabled It — Recheck";
    });
  }

  // Periodic re-check in case the user toggles their blocker mid-session
  setInterval(runDetection, 10000);
})();
