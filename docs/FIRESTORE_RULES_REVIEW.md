# Firestore rules review

Project target: Firebase project `synedn`, Android app `com.example.syncedn`, Firestore `(default)` in `asia-southeast1`.

## App paths checked

- User profile documents use `/users/{Firebase Auth UID}`.
- Team-owned data is stored under `/teams/{teamCode}` and its subcollections.
- Roster queries filter on `teamCode`; email-only user collection queries were removed because the deployed rules intentionally prohibit unbounded user lookups.
- Auth profile read errors and timeouts now propagate as failures instead of being treated as a missing profile. A transient read error therefore cannot trigger a new-profile write over an existing account.
- FCM token persistence uses `update("fcmToken", token)` so a messaging callback cannot create a partial `/users` document.
- Role, removal, and rejoin profile changes use the target user's UID. Rejoin approval now commits the team removal list, user membership, and request status in one Firestore batch.
- Previous account-specific role overrides and sample roster entries were removed from production code. Authentication remains tied to the Firebase account selected at sign-in.

## Local rules change

`firestore.rules` now has a narrowly-scoped leader-managed user update path. It permits a verified team leader to change only membership/ministry fields for another profile in that leader's team, with constrained removal/rejoin transitions. It keeps UID, email, and account creation time immutable. Normal user updates remain owner-scoped.

## Remaining verification

The Firebase project files are configured locally, but these rules have **not** been emulator-compiled or deployed to the cloud from this environment. The Firebase CLI has no active account session here. Android Studio launched, but its UI capture timed out; Gradle cannot start because Windows returned `Access is denied` when executing Android Studio's bundled `java.exe`. So a successful Android build and live Auth/Firestore run have not been confirmed here.

Before release, validate the rules and app workflows in the Firebase Emulator Suite. Then authenticate Firebase CLI as `sarmientomark936@gmail.com` and deploy the checked-in rules with `firebase deploy --only firestore:rules --project synedn`. Finally, build and exercise registration, Google sign-in, team creation/join, roster role changes, member removal, and rejoin approval.

## Data privacy note

The app still stores email, phone, and roster fields together in `/users/{uid}`. Same-team roster reads can therefore expose those contact fields to team members. Separate private account data from the team roster before storing sensitive contact details for a broader deployment.