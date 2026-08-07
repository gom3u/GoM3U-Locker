// =====================================================================
// ads/banner-ads.js — Decoy script for adblock.js (Signal #3)
// =====================================================================
// This file's PATH ("ads/banner-ads.js") intentionally matches generic
// ad-related URL patterns that filter lists (EasyList, AdGuard Base
// Filter, etc.) block regardless of domain — e.g. patterns like
// "/ads/*", "*banner-ads*", "*/ads/banner*".
//
// It contains no real ad code. Its only job is to set a flag that
// adblock.js checks for after the script loads, to confirm the
// request wasn't silently blocked or stubbed out with a fake response.
//
// Do NOT rename this file or move it out of the ads/ folder — doing so
// would defeat the purpose, since filter lists key off this exact path
// pattern.
// =====================================================================

window.__abdReady = true;
