// =====================================================================
// deviceinfo.js — lightweight UA-based device/browser/OS detection
// No external library, no PII (no IP address, no fingerprinting) — just
// a rough classification good enough for admin analytics.
// =====================================================================

export function getDeviceInfo() {
  const ua = navigator.userAgent || "";

  // ---- Device type ----
  let deviceType = "Desktop";
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T/i.test(ua)) {
    deviceType = "Tablet";
  } else if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) {
    deviceType = "Mobile";
  } else if (/Android/i.test(ua)) {
    // Android without "Mobile" token is usually a tablet
    deviceType = "Tablet";
  }

  // ---- OS ----
  let os = "Unknown";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  // ---- Browser ----
  let browser = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\/|OPR\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";

  return { deviceType, os, browser };
}
