# Link Locker

A modern, responsive "unlock link after viewing ads" web app built with
vanilla HTML/CSS/JS and Firebase (Authentication + Firestore). No
frameworks, no build step — deploy as-is to Firebase Hosting or GitHub
Pages.

## Project structure

```
index.html      → user unlock page (reads ?id=xxxxx)
admin.html       → admin login + dashboard + link management
style.css        → shared dark-mode glass UI styles
script.js        → user-side unlock flow logic
admin.js         → admin panel logic (auth, CRUD, realtime stats)
firebase.js      → Firebase config + SDK re-exports
firestore.rules  → security rules to paste into Firebase Console
```

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

**`unlocks` collection** — one lightweight doc per completed unlock,
used only to compute "Today's Unlocks" on the dashboard:

| Field     | Type      |
|-----------|-----------|
| linkId    | string    |
| timestamp | timestamp |

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
