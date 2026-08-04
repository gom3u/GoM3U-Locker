# Link Locker

A modern, responsive "unlock link after viewing ads" web app built with
vanilla HTML/CSS/JS and Firebase (Authentication + Firestore). No
frameworks, no build step — deploy as-is to Firebase Hosting or GitHub
Pages.

## Project structure

```
index.html      → user unlock page (reads ?id=xxxxx)
admin.html       → admin login + dashboard + link management
style.css        → shared dark/light glass UI styles
theme.js         → dark/light theme toggle (shared, loads before CSS)
deviceinfo.js    → lightweight device/OS/browser detection (no PII)
script.js        → user-side unlock flow logic + anti-fraud session token
admin.js         → admin panel logic (auth, CRUD, realtime stats, device
                    breakdown, per-link unlock history)
firebase.js      → Firebase config + SDK re-exports
firestore.rules  → security rules to paste into Firebase Console
```

## Deploying updates (cache-busting)

GitHub Pages / browsers cache static files aggressively. To make sure
users see your changes without needing to manually clear their
browser cache, this project uses a version query string (`?v=X.X.X`)
on every CSS/JS reference.

**Every time you push an update**, bump the version number in these
places (find-and-replace the old version with a new one, e.g.
`1.0.1` → `1.0.2`):

1. `index.html` — `theme.js?v=...`, `style.css?v=...`, `adblock.js?v=...`, `script.js?v=...`
2. `admin.html` — `theme.js?v=...`, `style.css?v=...`, `admin.js?v=...`
3. `script.js` — the `firebase.js?v=...` and `deviceinfo.js?v=...` import lines
4. `admin.js` — the `firebase.js?v=...` import line

Changing the version number makes the browser treat it as a brand-new
file, so it re-downloads instead of using a stale cached copy — no
action needed from your users.

## 1. Create your Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com) → **Add project**.
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. Under Authentication → Users, manually add your admin email/password
   (there is intentionally no public sign-up — admins are provisioned
   by you).
4. **Firestore Database** → Create database → Production mode.
5. Paste the contents of `firestore.rules` into Firestore → Rules, and
   publish.
6. Project Settings → General → "Your apps" → add a **Web app**, and
   copy the config object into `firebase.js` (replace the placeholder
   `firebaseConfig`).

## 2. Firestore data model

**`links` collection** — one document per lockable link:

| Field        | Type      | Notes                                   |
|--------------|-----------|------------------------------------------|
| title        | string    | Shown as the page subtitle              |
| realUrl      | string    | Hidden from the DOM until unlock         |
| ads1         | string    | Advertisement URL for Step 1             |
| ads2         | string    | Advertisement URL for Step 2             |
| buttonText   | string    | e.g. "View Advertisement"                |
| status       | string    | `active` \| `inactive`                   |
| createdAt    | timestamp | Set automatically on creation            |
| unlockCount  | number    | Incremented on every completed unlock    |

**`unlocks` collection** — one doc per completed unlock, used for
"Today's Unlocks", the Dashboard device breakdown, and per-link
unlock history (Links → 📱 History):

| Field      | Type      | Notes                              |
|------------|-----------|-------------------------------------|
| linkId     | string    |                                      |
| timestamp  | timestamp |                                      |
| deviceType | string    | `Desktop` \| `Mobile` \| `Tablet`   |
| os         | string    | e.g. `Windows`, `Android`, `iOS`    |
| browser    | string    | e.g. `Chrome`, `Safari`             |
| sessionId  | string    | Links back to the `sessions` doc    |

**`sessions` collection** — short-lived anti-fraud tokens, one per
unlock attempt (see "Notes on the security model" below):

| Field    | Type      | Notes                                    |
|----------|-----------|--------------------------------------------|
| linkId   | string    |                                              |
| step1At  | timestamp | Server-set the instant ad 1's 20s finishes  |
| step2At  | timestamp | Server-set the instant ad 2's 20s finishes  |
| used     | boolean   | Flipped true once redeemed (single-use)     |

> The per-link history query (`where linkId ==` + `orderBy timestamp`)
> needs a Firestore composite index. The first time you open 📱
> History, if it hasn't been created yet, check the browser console —
> Firestore's error message includes a direct link to auto-create it.

## 3. Run locally

Because this uses ES modules (`type="module"`), open it via a local
static server rather than `file://`:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then visit `http://localhost:8080/admin.html` to log in and create
your first link, and `http://localhost:8080/index.html?id=<docId>` to
test the unlock flow.

## 4. Deploy

**Firebase Hosting**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # point public dir to this folder
firebase deploy
```

**GitHub Pages** — just push this folder to a repo and enable Pages on
the branch/folder. No build step required.

## Notes on the security model

- The real destination URL is never rendered in the DOM or shown on
  screen — it's held in a private JS variable and only used at the
  moment "Copy Link" is clicked, after both ad steps are completed.
- Because this is a fully static, client-only app, the Firestore
  document (including `realUrl`) is still present in the network
  response when the page loads. For stricter concealment (hiding
  `realUrl` from the network entirely until unlock), add a Cloud
  Function that returns `realUrl` only after verifying a server-side
  unlock token — the current design is the right tradeoff for a
  no-backend static deployment.
- Firestore rules (`firestore.rules`) restrict writes to
  authenticated admins, with one narrow exception allowing the public
  unlock flow to increment `unlockCount` by exactly 1.
- Invalid/missing/inactive link IDs are handled gracefully with a
  dedicated error state instead of a broken page.
- Both "View Advertisement" buttons disable themselves immediately on
  click and stay disabled through the 20-second countdown to prevent
  spam-clicking; the Copy Link button is similarly debounced.
- **Anti-fraud session token (devtools/console protection):** every
  unlock now requires a `sessions` doc that a devtools user can't
  forge — it's created with a server timestamp when ad 1's real 20s
  finishes, can only be marked "step 2 done" after a genuine ~18s+
  server-verified gap, and can only be redeemed (incrementing
  `unlockCount`) once. This blocks the common abuse case of someone
  opening the console and calling `updateDoc(... unlockCount+1 ...)`
  directly in a loop. **It is not unbreakable** — this is a
  client-only app with no backend, so someone determined enough to
  script the entire two-step handshake (including the real wait)
  could still automate an unlock. Closing that last gap requires
  moving the final unlock step behind a Firebase Cloud Function,
  which is a reasonable next upgrade if this ever becomes a real
  problem.
- After pulling these changes, **re-paste `firestore.rules` into
  Firebase Console → Firestore Database → Rules and Publish** — the
  new `sessions` collection rules and the updated `links`/`unlocks`
  rules only take effect once published there.
