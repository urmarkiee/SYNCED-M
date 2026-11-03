# Kotlin Multiplatform migration

The project now includes a `shared` Kotlin Multiplatform library. Android remains the current app and keeps its existing Compose screens, Firebase SDKs, and platform-specific services.

## Shared today

`shared/src/commonMain` contains input validation used by Android through `ValidationUtils`. The module declares Android, iOS device, Intel simulator, and Apple Silicon simulator targets and exports the `SyncedShared` framework for a future SwiftUI client.

## Building an iOS app

The project declares the iOS targets, but compiling, running, signing, and packaging them requires macOS and Xcode. On a Mac, install the Kotlin Multiplatform IDE plugin in Android Studio, open this project, sync Gradle, then create an iOS app host in Xcode and link the `SyncedShared` framework.

## Firebase

The Android Firebase SDK stays in the Android app. An iOS host will need its own Firebase iOS app registration and `GoogleService-Info.plist`; the iOS client can point at the same Firebase project and Firestore schema. Authentication, Firestore access, push notifications, and other platform APIs should be implemented through platform-specific adapters before moving shared business logic to them. Never put service-account credentials in either client app.

This is an incremental migration foundation, not yet a complete iOS application. The existing Android screens and backend repositories have not been migrated into shared code.
