// =====================================================================
// theme.js — Dark/Light theme toggle, shared by index.html + admin.html
// Loaded as a normal (blocking, non-module) script BEFORE style.css in
// <head> so the correct theme class is on <html> before first paint —
// this avoids a flash of the wrong theme.
// =====================================================================

(function applyStoredTheme() {
  try {
    const stored = localStorage.getItem("linklocker-theme");
    if (stored === "light") {
      document.documentElement.classList.add("light-theme");
    }
  } catch (err) {
    // localStorage may be unavailable (privacy mode, etc.) — default to dark.
  }
})();

function toggleTheme() {
  document.documentElement.classList.toggle("light-theme");
  const isLight = document.documentElement.classList.contains("light-theme");
  try {
    localStorage.setItem("linklocker-theme", isLight ? "light" : "dark");
  } catch (err) {
    // Ignore — theme just won't persist across visits.
  }
  updateToggleButtons();
}

function updateToggleButtons() {
  const isLight = document.documentElement.classList.contains("light-theme");
  document.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
    btn.textContent = isLight ? "🌙" : "☀️";
    btn.setAttribute(
      "aria-label",
      isLight ? "Switch to dark mode" : "Switch to light mode"
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateToggleButtons();
  document.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", toggleTheme);
  });
});
