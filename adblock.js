// =====================================================================
// adblock.js — Ad Blocker & DNS-level Ad Blocker Detector (v3)
// =====================================================================
// Detects blocking with THREE independent signals, since relying on a
// single method is easy to bypass:
//
//   1. Bait element — a hidden div with ad-related class names that
//      cosmetic filter lists hide via CSS.
//
//   2. Real ad-network script (Google AdSense) — loaded via a <script>
//      tag. IMPORTANT: some blockers (AdGuard, newer uBlock builds)
//      don't fail the request outright — they return a fake empty
//      200 response so `onload` still fires. To catch this, after
//      onload we verify the script actually did what the real file
//      does (define `window.adsbygoogle`). If that's missing, it was
//      stubbed out → still counts as blocked.
//
//   3. Self-hosted decoy script (ads/banner-ads.js) — a first-party
//      file whose *path* matches generic ad-related patterns that
//      URL-pattern filter lists block regardless of domain. This is
//      much harder for a blocker to "fake" a clean response for,
//      since it's not a well-known ad-network URL that a spoofing
//      rule would specifically target.
//
// DNS-level blockers (Pi-hole, AdGuard DNS, NextDNS) are caught by
// signal #2, since the DNS lookup itself fails and fires onerror.
//
// If ANY signal trips, a full-screen overlay blocks the page until
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

  // ---- Signal 1: bait element (cosmetic/CSS-based ad blockers) ----
  function checkBaitElement() {
    return new Promise((resolve) => {
      const bait = document.createElement("div");
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

  // Generic script-tag loader used by both signal 2 and 3 below.
  // `verifyFn` runs after onload to confirm the script wasn't stubbed
  // out with a fake empty 200 response.
  function loadAndVerify(url, verifyFn, timeoutMs = 8000) {
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

      const timer = setTimeout(() => finish(true), timeoutMs);

      script.onload = () => {
        // Give the script a tick to execute before we check its effects
        setTimeout(() => finish(!verifyFn()), 30);
      };
      script.onerror = () => finish(true);

      script.src = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();
      script.async = true;
      document.body.appendChild(script);
    });
  }

  // ---- Signal 2: real Google AdSense script ----
  function checkAdNetworkScript() {
    return loadAndVerify(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      () => typeof window.adsbygoogle !== "undefined"
    );
  }

  // ---- Signal 3: self-hosted decoy with an ad-like path/filename ----
  function checkDecoyScript() {
    // Resolve relative to this page so it works in any subfolder/domain
    const decoyUrl = new URL("ads/banner-ads.js", window.location.href).href;
    return loadAndVerify(decoyUrl, () => window.__abdReady === true);
  }

  async function runDetection() {
    const [baitBlocked, adNetworkBlocked, decoyBlocked] = await Promise.all([
      checkBaitElement(),
      checkAdNetworkScript(),
      checkDecoyScript(),
    ]);

    if (baitBlocked || adNetworkBlocked || decoyBlocked) {
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
  setInterval(runDetection, 20000);
})();
