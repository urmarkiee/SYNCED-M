# SyncedM Web

This is the browser companion to the Android app. It uses the Firebase Web app registered in project `synedn` and reads/writes the same authenticated Firestore collections as Android:

- `/users/{uid}` for the signed-in member profile
- `/teams/{teamCode}` for team metadata
- `/teams/{teamCode}/services`, `/songs`, and `/announcements` for team planning

Email/password and Google sign-in use Firebase Authentication. Reads and writes are made from the browser SDK and remain governed by the project's Firestore security rules. No Admin SDK credentials or private service-account keys are included.

## Run locally

Serve the `web` directory over HTTP (Firebase Auth does not work reliably from a `file://` URL). From the project root, use:

```powershell
python -m http.server 5173 --directory web
```

Then open `http://localhost:5173`. If Google sign-in reports `auth/unauthorized-domain`, add `localhost` under Firebase Console → Authentication → Settings → Authorized domains. Email/password sign-in uses the same accounts as the Android app.

## Firebase Hosting

The root `firebase.json` points Firebase Hosting at this directory. After previewing the app, publish only this web client with:

```powershell
npx -y firebase-tools@latest deploy --only hosting --project synedn
```

This deploy command does not include Cloud Functions.
