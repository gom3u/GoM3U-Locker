// =====================================================================
// admin.js — Admin Panel logic (Auth + Firestore CRUD + realtime stats)
// =====================================================================

import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "./firebase.js?v=1.0.2";

// ---------- DOM refs ----------
const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");

const navLinks = document.querySelectorAll(".nav-link[data-view]");
const dashboardView = document.getElementById("dashboard-view");
const linksView = document.getElementById("links-view");

const statTotalLinks = document.getElementById("stat-total-links");
const statTotalUnlocks = document.getElementById("stat-total-unlocks");
const statTodayUnlocks = document.getElementById("stat-today-unlocks");
const dbiDesktop = document.getElementById("dbi-desktop");
const dbiMobile = document.getElementById("dbi-mobile");
const dbiTablet = document.getElementById("dbi-tablet");

const historyModalOverlay = document.getElementById("history-modal-overlay");
const historyModalTitle = document.getElementById("history-modal-title");
const historyLoading = document.getElementById("history-loading");
const historyEmpty = document.getElementById("history-empty");
const historyList = document.getElementById("history-list");
const historyCloseBtn = document.getElementById("history-close-btn");

const linksTableBody = document.getElementById("links-table-body");
const linksEmpty = document.getElementById("links-empty");
const searchInput = document.getElementById("search-input");
const addLinkBtn = document.getElementById("add-link-btn");

const modalOverlay = document.getElementById("link-modal-overlay");
const modalTitle = document.getElementById("modal-title");
const linkForm = document.getElementById("link-form");
const editDocId = document.getElementById("edit-doc-id");
const fTitle = document.getElementById("f-title");
const fRealUrl = document.getElementById("f-realUrl");
const fAds1 = document.getElementById("f-ads1");
const fAds2 = document.getElementById("f-ads2");
const fButtonText = document.getElementById("f-buttonText");
const fStatus = document.getElementById("f-status");
const formError = document.getElementById("form-error");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalSaveBtn = document.getElementById("modal-save-btn");

let allLinks = []; // cached from realtime listener, for client-side search
let unsubLinks = null;
let unsubUnlocksToday = null;
let unsubDeviceBreakdown = null;
let saving = false; // spam-click guard for save button
let deletingIds = new Set(); // spam-click guard per row

// ---------- Toast helper ----------
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// =====================================================================
// AUTH
// =====================================================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginView.style.display = "none";
    adminView.style.display = "flex";
    startRealtimeListeners();
  } else {
    adminView.style.display = "none";
    loginView.style.display = "flex";
    stopRealtimeListeners();
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.style.display = "none";
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in…";

  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
  } catch (err) {
    loginError.textContent = "Invalid email or password.";
    loginError.style.display = "block";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// =====================================================================
// NAVIGATION
// =====================================================================
navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    const viewId = link.dataset.view;
    dashboardView.style.display = viewId === "dashboard-view" ? "block" : "none";
    linksView.style.display = viewId === "links-view" ? "block" : "none";
  });
});

// =====================================================================
// REALTIME LISTENERS
// =====================================================================
function startRealtimeListeners() {
  // Links collection — realtime, drives both the table and total stats
  const linksQuery = query(collection(db, "links"), orderBy("createdAt", "desc"));
  unsubLinks = onSnapshot(
    linksQuery,
    (snap) => {
      allLinks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderLinksTable();
      renderTotals();
    },
    (err) => {
      console.error(err);
      showToast("Failed to load links.", "error");
    }
  );

  // Today's unlocks — realtime, filtered by timestamp
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const unlocksQuery = query(
    collection(db, "unlocks"),
    where("timestamp", ">=", Timestamp.fromDate(startOfToday))
  );
  unsubUnlocksToday = onSnapshot(
    unlocksQuery,
    (snap) => {
      statTodayUnlocks.textContent = snap.size;
    },
    (err) => {
      console.error(err);
      statTodayUnlocks.textContent = "—";
    }
  );

  // Device breakdown — all-time, based on logged unlock events. Like
  // "Today's Unlocks", this counts logged events (including ones from
  // links that were later deleted), so it can differ from the
  // unlockCount-based "Total Unlocks" figure above — same reason as
  // discussed for the Today's Unlocks stat.
  const allUnlocksQuery = query(collection(db, "unlocks"));
  unsubDeviceBreakdown = onSnapshot(
    allUnlocksQuery,
    (snap) => {
      let desktop = 0, mobile = 0, tablet = 0;
      snap.forEach((d) => {
        const type = d.data().deviceType;
        if (type === "Mobile") mobile++;
        else if (type === "Tablet") tablet++;
        else desktop++; // Desktop, or unknown/older entries without deviceType
      });
      dbiDesktop.textContent = desktop;
      dbiMobile.textContent = mobile;
      dbiTablet.textContent = tablet;
    },
    (err) => {
      console.error(err);
      dbiDesktop.textContent = dbiMobile.textContent = dbiTablet.textContent = "—";
    }
  );
}

function stopRealtimeListeners() {
  if (unsubLinks) unsubLinks();
  if (unsubUnlocksToday) unsubUnlocksToday();
  if (unsubDeviceBreakdown) unsubDeviceBreakdown();
}

function renderTotals() {
  statTotalLinks.textContent = allLinks.length;
  const totalUnlocks = allLinks.reduce((sum, l) => sum + (l.unlockCount || 0), 0);
  statTotalUnlocks.textContent = totalUnlocks;
}

// =====================================================================
// LINKS TABLE
// =====================================================================
function renderLinksTable() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const filtered = searchTerm
    ? allLinks.filter((l) => (l.title || "").toLowerCase().includes(searchTerm))
    : allLinks;

  linksTableBody.innerHTML = "";
  linksEmpty.style.display = filtered.length === 0 ? "block" : "none";

  filtered.forEach((link) => {
    // Build the folder path this admin.html lives in (works whether the
    // browser shows ".../admin.html", ".../admin", or ".../admin/"),
    // then always point the share link at index.html in that same folder.
    const folderPath = window.location.pathname.substring(
      0,
      window.location.pathname.lastIndexOf("/") + 1
    );
    const shareUrl = `${window.location.origin}${folderPath}index.html?id=${link.id}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(link.title || "Untitled")}</td>
      <td><span class="badge ${link.status === "active" ? "active" : "inactive"}">${
        link.status === "active" ? "Active" : "Inactive"
      }</span></td>
      <td>${link.unlockCount || 0}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${shareUrl}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" data-action="copy" data-url="${shareUrl}">📋 Copy</button>
          <button class="btn btn-secondary btn-sm" data-action="history" data-id="${link.id}" data-title="${escapeHtml(link.title || "Untitled")}">📱 History</button>
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${link.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${link.id}">🗑️ Delete</button>
        </div>
      </td>
    `;
    linksTableBody.appendChild(tr);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

searchInput.addEventListener("input", renderLinksTable);

// Event delegation for table row actions
linksTableBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(btn.dataset.url);
      showToast("Share URL copied successfully.", "success");
    } catch (err) {
      showToast("Unable to copy URL.", "error");
    }
  }

  if (action === "edit") {
    const link = allLinks.find((l) => l.id === btn.dataset.id);
    if (link) openModal(link);
  }

  if (action === "history") {
    openHistoryModal(btn.dataset.id, btn.dataset.title);
  }

  if (action === "delete") {
    const id = btn.dataset.id;
    if (deletingIds.has(id)) return; // spam-click guard
    const confirmed = window.confirm("Delete this link? This cannot be undone.");
    if (!confirmed) return;

    deletingIds.add(id);
    btn.disabled = true;
    try {
      await deleteDoc(doc(db, "links", id));
      showToast("Link deleted.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete link.", "error");
    } finally {
      deletingIds.delete(id);
    }
  }
});

// =====================================================================
// UNLOCK HISTORY MODAL (per link, device/browser/OS log)
// =====================================================================
async function openHistoryModal(linkId, title) {
  historyModalTitle.textContent = `Unlock History — ${title}`;
  historyList.innerHTML = "";
  historyEmpty.style.display = "none";
  historyLoading.style.display = "block";
  historyModalOverlay.classList.add("show");

  try {
    // NOTE: this query (where linkId == ... + orderBy timestamp) needs a
    // Firestore composite index. The first time this runs, if it hasn't
    // been created yet, Firestore's error message includes a direct link
    // to auto-create it in the console — just click that link once.
    const historyQuery = query(
      collection(db, "unlocks"),
      where("linkId", "==", linkId),
      orderBy("timestamp", "desc"),
      limit(20)
    );
    const snap = await getDocs(historyQuery);
    historyLoading.style.display = "none";

    if (snap.empty) {
      historyEmpty.style.display = "block";
      return;
    }

    snap.forEach((d) => {
      const data = d.data();
      const item = document.createElement("div");
      item.className = "history-item";
      const deviceLabel = [data.deviceType, data.os, data.browser].filter(Boolean).join(" · ") || "Unknown device";
      const timeLabel = data.timestamp && data.timestamp.toDate
        ? data.timestamp.toDate().toLocaleString()
        : "Just now";
      item.innerHTML = `
        <span class="hi-device">${escapeHtml(deviceLabel)}</span>
        <span class="hi-time">${escapeHtml(timeLabel)}</span>
      `;
      historyList.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    historyLoading.style.display = "none";
    historyEmpty.textContent = "Could not load history. Check the console — this may need a Firestore index (Firestore will show a link to create it).";
    historyEmpty.style.display = "block";
  }
}

historyCloseBtn.addEventListener("click", () => {
  historyModalOverlay.classList.remove("show");
});
historyModalOverlay.addEventListener("click", (e) => {
  if (e.target === historyModalOverlay) historyModalOverlay.classList.remove("show");
});

// =====================================================================
// ADD / EDIT MODAL
// =====================================================================
function openModal(link = null) {
  formError.style.display = "none";
  linkForm.reset();

  if (link) {
    modalTitle.textContent = "Edit Link";
    editDocId.value = link.id;
    fTitle.value = link.title || "";
    fRealUrl.value = link.realUrl || "";
    fAds1.value = link.ads1 || "";
    fAds2.value = link.ads2 || "";
    fButtonText.value = link.buttonText || "View Advertisement";
    fStatus.value = link.status || "active";
  } else {
    modalTitle.textContent = "Add Link";
    editDocId.value = "";
    fButtonText.value = "View Advertisement";
    fStatus.value = "active";
  }

  modalOverlay.classList.add("show");
}

function closeModal() {
  modalOverlay.classList.remove("show");
}

addLinkBtn.addEventListener("click", () => openModal());
modalCancelBtn.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

linkForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (saving) return; // spam-click guard
  saving = true;
  modalSaveBtn.disabled = true;
  modalSaveBtn.textContent = "Saving…";
  formError.style.display = "none";

  try {
    const payload = {
      title: fTitle.value.trim(),
      realUrl: fRealUrl.value.trim(),
      ads1: fAds1.value.trim(),
      ads2: fAds2.value.trim(),
      buttonText: fButtonText.value.trim() || "View Advertisement",
      status: fStatus.value,
    };

    // Basic validation
    try {
      new URL(payload.realUrl);
      new URL(payload.ads1);
      new URL(payload.ads2);
    } catch {
      throw new Error("Please enter valid URLs for Real URL and both ad links.");
    }

    if (editDocId.value) {
      await updateDoc(doc(db, "links", editDocId.value), payload);
      showToast("Link updated successfully.", "success");
    } else {
      await addDoc(collection(db, "links"), {
        ...payload,
        unlockCount: 0,
        createdAt: serverTimestamp(),
      });
      showToast("Link created successfully.", "success");
    }

    closeModal();
  } catch (err) {
    console.error(err);
    formError.textContent = err.message || "Something went wrong. Please try again.";
    formError.style.display = "block";
  } finally {
    saving = false;
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = "Save Link";
  }
});
