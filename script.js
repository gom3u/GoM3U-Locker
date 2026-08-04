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
} from "./firebase.js";

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

// ---------- State ----------
const COUNTDOWN_SECONDS = 20;
let linkData = null; // holds { title, ads1, ads2, buttonText, status } — no realUrl here
let realUrlPrivate = null; // kept out of the DOM entirely
let linkDocId = null;
let step1Clicking = false; // spam-click guards
let step2Clicking = false;

// ---------- Toast helper ----------
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

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

  const adWindow = window.open(linkData.ads1, "_blank", "noopener,noreferrer");
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
    },
    onAbort: () => {
      showToast(
        "You closed the advertisement early. Please keep it open for the full 20 seconds.",
        "error"
      );
      btnStep1.disabled = false; // let them retry
      step1Clicking = false;
    },
  });
});

// ---------- Step 2 ----------
btnStep2.addEventListener("click", () => {
  if (step2Clicking || btnStep2.disabled) return; // spam-click guard
  step2Clicking = true;

  btnStep2.disabled = true;

  const adWindow = window.open(linkData.ads2, "_blank", "noopener,noreferrer");
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

      recordUnlock();
    },
    onAbort: () => {
      showToast(
        "You closed the advertisement early. Please keep it open for the full 20 seconds.",
        "error"
      );
      btnStep2.disabled = false; // let them retry
      step2Clicking = false;
    },
  });
});

// ---------- Record unlock stats (fire-and-forget, non-blocking) ----------
async function recordUnlock() {
  try {
    await updateDoc(doc(db, "links", linkDocId), {
      unlockCount: increment(1),
    });
    await addDoc(collection(db, "unlocks"), {
      linkId: linkDocId,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    // Non-critical — don't block the user's unlock experience
    console.warn("Could not record unlock stat:", err);
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
