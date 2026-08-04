// =====================================================================
// adblock.js — Ad Blocker & DNS-level Ad Blocker Detector
// =====================================================================
// Detects two categories of blocking so users can't skip the ad steps:
//   1. Browser-extension ad blockers (uBlock Origin, AdBlock Plus, etc.)
//      → detected via a "bait" element that these extensions hide.
//   2. DNS-level / network-level ad blocking (Pi-hole, AdGuard DNS,
//      NextDNS, some VPNs/firewalls) → detected by attempting to fetch
//      a real ad-serving script; DNS-level blockers make the request
//      fail outright (NXDOMAIN / connection refused), which we catch.
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

  // ---- Method 2: real ad-script fetch (catches DNS-level blockers too) ----
  function checkAdScriptFetch() {
    const testUrls = [
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      "https://www.googletagservices.com/tag/js/gpt.js",
    ];

    const attempts = testUrls.map(
      (url) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 1800); // treat timeout as blocked
          fetch(url, { mode: "no-cors", cache: "no-store" })
            .then(() => {
              clearTimeout(timer);
              resolve(true); // request completed (host resolved & reachable)
            })
            .catch(() => {
              clearTimeout(timer);
              resolve(false); // DNS refusal / connection blocked / extension blocked it
            });
        })
    );

    // Blocked only if BOTH test URLs failed (avoids false positives from
    // one flaky/offline CDN)
    return Promise.all(attempts).then((results) => results.every((ok) => !ok));
  }

  async function runDetection() {
    const [baitBlocked, fetchBlocked] = await Promise.all([
      checkBaitElement(),
      checkAdScriptFetch(),
    ]);

    if (baitBlocked || fetchBlocked) {
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
