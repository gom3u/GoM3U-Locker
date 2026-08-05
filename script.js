// =====================================================================
// script.js — Link Locker (user-facing unlock flow)
// =====================================================================
// Security note: the Firestore document for a link is fetched once on
// load (we need ads1/ads2/title even before unlocking). The `realUrl`
// field is kept only in a private JS variable inside this module and is
// NEVER written to the DOM — it's only used at the moment "Copy Link"
// is clicked, after both steps are complete. For true server-side
// concealment (hiding realUrl from network traffic entirely until
// unlock) you would move the final unlock step behind a Cloud Function/
// Firestore rule + custom claim. This client-only implementation is a
// reasonable, production-friendly middle ground for a static hosting
// deployment (Firebase Hosting / GitHub Pages).
// =====================================================================

import {
  db,
  doc,
  getDoc,
  updateDoc,
  increment,
  collection,
  addDoc,
  serverTimestamp,
  runTransaction,
} from "./firebase.js?v=1.0.6";
import { getDeviceInfo } from "./deviceinfo.js?v=1.0.6";

// ---------- DOM refs ----------
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");
const mainState = document.getElementById("main-state");
const linkTitleSub = document.getElementById("link-title-sub");
const progressLabel = document.getElementById("progress-label");

const progressStep1 = document.getElementById("progress-step-1");
const progressStep2 = document.getElementById("progress-step-2");
const progressStepDone = document.getElementById("progress-step-done");

const step1Block = document.getElementById("step-1-block");
const step2Block = document.getElementById("step-2-block");
const unlockedBox = document.getElementById("unlocked-box");

const btnStep1 = document.getElementById("btn-step-1");
const btnStep1Label = document.getElementById("btn-step-1-label");
const btnStep2 = document.getElementById("btn-step-2");
const btnStep2Label = document.getElementById("btn-step-2-label");
const btnCopy = document.getElementById("btn-copy");

const countdown1 = document.getElementById("countdown-1");
const countdown1Num = document.getElementById("countdown-1-num");
const countdown1Bar = document.getElementById("countdown-1-bar");

const countdown2 = document.getElementById("countdown-2");
const countdown2Num = document.getElementById("countdown-2-num");
const countdown2Bar = document.getElementById("countdown-2-bar");

const earlyCloseOverlay = document.getElementById("early-close-overlay");
const earlyCloseRetryBtn = document.getElementById("early-close-retry-btn");
let earlyCloseResumeFn = null; // set right before the modal opens

// ---------- State ----------
const COUNTDOWN_SECONDS = 20;
let linkData = null; // holds { title, ads1, ads2, buttonText, status } — no realUrl here
let realUrlPrivate = null; // kept out of the DOM entirely
let linkDocId = null;
let step1Clicking = false; // spam-click guards
let step2Clicking = false;

// ---------- Anti-fraud session token ----------
// See firestore.rules for the server-enforced half of this: a random
// devtools call to bump unlockCount is rejected unless it's accompanied
// by a `sessions` doc that genuinely went through step1 -> (18s+ real
// gap, server-timestamped) -> step2, and hasn't been redeemed before.
let sessionId = null;

async function beginSession() {
  try {
    const ref = await addDoc(collection(db, "sessions"), {
      linkId: linkDocId,
      step1At: serverTimestamp(),
    });
    sessionId = ref.id;
  } catch (err) {
    // Non-fatal: the unlock UX still works, but this unlock may not be
    // counted in stats if the session can't be established (e.g. briefly
    // offline right at step 1).
    console.warn("Could not start anti-fraud session:", err);
    sessionId = null;
    // TEMP DEBUG — remove once the root cause is confirmed:
    showToast("DEBUG session1: " + (err.code || err.message || String(err)), "error");
  }
}

async function completeSessionStep2() {
  if (!sessionId) return;
  try {
    await updateDoc(doc(db, "sessions", sessionId), {
      step2At: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Could not finalize anti-fraud session:", err);
    sessionId = null;
    // TEMP DEBUG — remove once the root cause is confirmed:
    showToast("DEBUG session2: " + (err.code || err.message || String(err)), "error");
  }
}

// ---------- Toast helper ----------
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ---------- Early-close modal helper ----------
function showEarlyCloseModal(onRetry) {
  earlyCloseResumeFn = onRetry;
  earlyCloseOverlay.classList.add("show");
}

earlyCloseRetryBtn.addEventListener("click", () => {
  earlyCloseOverlay.classList.remove("show");
  if (typeof earlyCloseResumeFn === "function") {
    earlyCloseResumeFn();
    earlyCloseResumeFn = null;
  }
});

// ---------- Init ----------
async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return showError("No link ID was provided in the URL.");
  }

  try {
    const ref = doc(db, "links", id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return showError("This link does not exist.");
    }

    const data = snap.data();

    if (!data.status || data.status !== "active") {
      return showError("This link is currently inactive.");
    }

    // Basic shape validation — handle malformed docs gracefully
    if (!data.realUrl || !data.ads1 || !data.ads2) {
      return showError("This link is misconfigured. Please contact the owner.");
    }

    linkDocId = id;
    realUrlPrivate = data.realUrl; // never rendered to DOM
    linkData = {
      title: data.title || "Unlock Your Link",
      ads1: data.ads1,
      ads2: data.ads2,
      buttonText: data.buttonText || "View Advertisement",
    };

    renderMain();
  } catch (err) {
    console.error(err);
    showError("Something went wrong while loading this link. Please try again later.");
  }
}

function showError(message) {
  loadingState.style.display = "none";
  errorState.style.display = "block";
  errorMessage.textContent = message;
}

function renderMain() {
  loadingState.style.display = "none";
  mainState.style.display = "block";
  linkTitleSub.textContent = linkData.title;
  btnStep1Label.textContent = `${linkData.buttonText} 1`;
  btnStep2Label.textContent = `${linkData.buttonText} 2`;
}

// ---------- Countdown utility ----------
// `adWindow` is polled every second — if the user closes the ad tab
// before the countdown finishes, the countdown aborts and `onAbort`
// resets the step so the ad must be watched again in full.
function runCountdown({ numEl, barEl, wrapEl, seconds, adWindow, onDone, onAbort }) {
  wrapEl.classList.remove("aborted");
  wrapEl.classList.add("show");
  numEl.textContent = seconds;

  // Reset + trigger the shrinking progress bar animation
  barEl.style.animation = "none";
  // Force reflow so the animation restarts cleanly
  void barEl.offsetWidth;
  barEl.style.animationName = "shrinkBar";
  barEl.style.animationDuration = `${seconds}s`;

  let remaining = seconds;
  const interval = setInterval(() => {
    // If the ad tab was closed early, abort — this only works when the
    // pop-up actually opened (adWindow is not null/blocked)
    if (adWindow && adWindow.closed) {
      clearInterval(interval);
      wrapEl.classList.remove("show");
      barEl.style.animationName = "none";
      onAbort();
      return;
    }

    remaining -= 1;
    numEl.textContent = Math.max(remaining, 0);
    if (remaining <= 0) {
      clearInterval(interval);
      wrapEl.classList.remove("show");
      onDone();
    }
  }, 1000);
}

// ---------- Step 1 ----------
btnStep1.addEventListener("click", () => {
  if (step1Clicking || btnStep1.disabled) return; // spam-click guard
  step1Clicking = true;

  btnStep1.disabled = true;

  // NOTE: deliberately not using "noopener,noreferrer" here — those flags
  // make window.open() return null in modern browsers, which breaks our
  // ability to detect if the user closes the ad tab early (see runCountdown).
  const adWindow = window.open(linkData.ads1, "_blank");
  if (!adWindow) {
    showToast("Please allow pop-ups to continue.", "error");
    btnStep1.disabled = false;
    step1Clicking = false;
    return;
  }

  runCountdown({
    numEl: countdown1Num,
    barEl: countdown1Bar,
    wrapEl: countdown1,
    seconds: COUNTDOWN_SECONDS,
    adWindow,
    onDone: () => {
      // Advance progress UI
      progressStep1.classList.remove("active");
      progressStep1.classList.add("done");
      progressStep1.querySelector(".dot").textContent = "✓";
      progressStep2.classList.add("active");
      progressLabel.textContent = "Step 2 of 2";

      step1Block.classList.remove("active");
      step2Block.classList.add("active");
      btnStep2.disabled = false;
      step1Clicking = false;

      // Start the anti-fraud session token now — the real 20s just
      // elapsed, this timestamp becomes the server-verified anchor.
      beginSession();
    },
    onAbort: () => {
      showToast(
        "You closed the advertisement early. Please keep it open for the full 20 seconds.",
        "error"
      );
      btnStep1.disabled = false; // let them retry
      step1Clicking = false;
      showEarlyCloseModal(() => {
        // Nothing extra needed — button is already re-enabled above;
        // this just dismisses the modal and lets the user click again.
      });
    },
  });
});

// ---------- Step 2 ----------
btnStep2.addEventListener("click", () => {
  if (step2Clicking || btnStep2.disabled) return; // spam-click guard
  step2Clicking = true;

  btnStep2.disabled = true;

  const adWindow = window.open(linkData.ads2, "_blank");
  if (!adWindow) {
    showToast("Please allow pop-ups to continue.", "error");
    btnStep2.disabled = false;
    step2Clicking = false;
    return;
  }

  runCountdown({
    numEl: countdown2Num,
    barEl: countdown2Bar,
    wrapEl: countdown2,
    seconds: COUNTDOWN_SECONDS,
    adWindow,
    onDone: () => {
      progressStep2.classList.remove("active");
      progressStep2.classList.add("done");
      progressStep2.querySelector(".dot").textContent = "✓";
      progressStepDone.classList.add("done");
      progressLabel.textContent = "Completed";

      step2Block.classList.remove("active");
      unlockedBox.classList.add("show");
      step2Clicking = false;

      // The unlocked UI above is never blocked by this — stats recording
      // is best-effort so a network hiccup never breaks the user's unlock.
      (async () => {
        await completeSessionStep2();
        recordUnlock();
      })();
    },
    onAbort: () => {
      showToast(
        "You closed the advertisement early. Please keep it open for the full 20 seconds.",
        "error"
      );
      btnStep2.disabled = false; // let them retry
      step2Clicking = false;
      showEarlyCloseModal(() => {
        // Nothing extra needed — button is already re-enabled above;
        // this just dismisses the modal and lets the user click again.
      });
    },
  });
});

// ---------- Record unlock stats (fire-and-forget, non-blocking) ----------
// Uses a Firestore transaction so the session gets marked "used", the
// link's unlockCount goes up, and the device-info log entry is written
// atomically together — see firestore.rules for the server-side half of
// the session-token check.
async function recordUnlock() {
  if (!sessionId) {
    console.warn("No valid anti-fraud session — this unlock was not counted in stats.");
    return;
  }

  const device = getDeviceInfo();

  try {
    const linkRef = doc(db, "links", linkDocId);
    const sessionRef = doc(db, "sessions", sessionId);
    const unlockLogRef = doc(collection(db, "unlocks"));

    await runTransaction(db, async (tx) => {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists() || sessionSnap.data().used === true || !sessionSnap.data().step2At) {
        throw new Error("Session is not valid for redemption.");
      }

      tx.update(sessionRef, { used: true });
      tx.update(linkRef, { unlockCount: increment(1), lastSessionId: sessionId });
      tx.set(unlockLogRef, {
        linkId: linkDocId,
        timestamp: serverTimestamp(),
        deviceType: device.deviceType,
        os: device.os,
        browser: device.browser,
        sessionId: sessionId,
      });
    });
  } catch (err) {
    // Non-critical — don't block the user's unlock experience
    console.warn("Could not record unlock stat:", err);
    // TEMP DEBUG — remove once the root cause is confirmed:
    showToast("DEBUG: " + (err.code || err.message || String(err)), "error");
  }
}

// ---------- Copy link ----------
let copyLocked = false; // spam-click guard
btnCopy.addEventListener("click", async () => {
  if (copyLocked) return;
  copyLocked = true;
  setTimeout(() => (copyLocked = false), 800);

  try {
    await navigator.clipboard.writeText(realUrlPrivate);
    showToast("Link copied successfully.", "success");
  } catch (err) {
    // Fallback for older browsers / insecure contexts
    try {
      const textarea = document.createElement("textarea");
      textarea.value = realUrlPrivate;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showToast("Link copied successfully.", "success");
    } catch (fallbackErr) {
      console.error(fallbackErr);
      showToast("Unable to copy link. Please try again.", "error");
    }
  }
});

init();
