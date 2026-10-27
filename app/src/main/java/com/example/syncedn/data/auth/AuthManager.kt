package com.example.syncedn.data.auth

import android.content.Context
import com.example.syncedn.data.database.FirestoreManager
import com.example.syncedn.data.model.UserProfile
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider

/**
 * Handles Firebase Authentication (Email/Password registration, login, password reset, Google sign-in).
 * Automatically links authenticated users to their Firestore profile.
 */
object AuthManager {
    // Fallback for projects that do not yet generate default_web_client_id.
    const val WEB_CLIENT_ID = "811884997432-jsflthifrbv7ssv77u4dmliin2dsit0a.apps.googleusercontent.com"

    /** Reads the web OAuth client ID generated from the current google-services.json. */
    fun getWebClientId(context: Context): String {
        val resourceId = context.resources.getIdentifier(
            "default_web_client_id",
            "string",
            context.packageName
        )
        return if (resourceId != 0) context.getString(resourceId).trim() else WEB_CLIENT_ID
    }

    val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }

    val currentUser: FirebaseUser?
        get() = try { auth.currentUser } catch (e: Exception) { null }

    val isLoggedIn: Boolean
        get() = currentUser != null

    /**
     * Registers a new user with Email and Password, and creates their profile in Cloud Firestore.
     */
    fun registerUser(
        username: String,
        email: String,
        password: String,
        onComplete: (Result<UserProfile>) -> Unit
    ) {
        try {
            auth.createUserWithEmailAndPassword(email, password)
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        val user = auth.currentUser ?: task.result?.user
                        if (user != null) {
                            val profile = UserProfile(
                                uid = user.uid,
                                username = username,
                                email = email,
                                role = "",
                                teamName = ""
                            )
                            FirestoreManager.saveUserProfile(profile) { saveResult ->
                                saveResult.fold(
                                    onSuccess = { onComplete(Result.success(profile)) },
                                    onFailure = { cause ->
                                        auth.signOut()
                                        onComplete(Result.failure(IllegalStateException(
                                            "Your account was created, but its Firestore profile could not be saved. Please sign in again to retry.",
                                            cause
                                        )))
                                    }
                                )
                            }
                            return@addOnCompleteListener
                        }
                    }
                    val error = task.exception ?: Exception("Registration failed")
                    onComplete(Result.failure(error))
                }
        } catch (e: Exception) {
            onComplete(Result.failure(e))
        }
    }

    /**
     * Signs in using a Google ID Token retrieved from Google Sign-In.
     */
    fun signInWithGoogle(
        idToken: String,
        onComplete: (Result<UserProfile>) -> Unit
    ) {
        try {
            val credential = GoogleAuthProvider.getCredential(idToken, null)
            auth.signInWithCredential(credential)
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        val user = auth.currentUser ?: task.result?.user
                        if (user != null) {
                            FirestoreManager.getUserProfile(user.uid) { profileResult ->
                                if (profileResult.isFailure) {
                                    onComplete(Result.failure(profileResult.exceptionOrNull()
                                        ?: IllegalStateException("Could not load your Firestore profile.")))
                                    return@getUserProfile
                                }
                                val existing = profileResult.getOrNull()
                                val profile = existing ?: UserProfile(
                                    uid = user.uid,
                                    username = user.displayName ?: user.email?.substringBefore("@") ?: "Member",
                                    email = user.email.orEmpty(),
                                    role = "",
                                    teamName = ""
                                )
                                if (existing == null) {
                                    FirestoreManager.saveUserProfile(profile) { saveResult ->
                                        saveResult.fold(
                                            onSuccess = { onComplete(Result.success(profile)) },
                                            onFailure = { cause ->
                                                auth.signOut()
                                                onComplete(Result.failure(IllegalStateException(
                                                    "Google sign-in succeeded, but your Firestore profile could not be saved. Please sign in again to retry.",
                                                    cause
                                                )))
                                            }
                                        )
                                    }
                                } else {
                                    onComplete(Result.success(profile))
                                }
                            }
                            return@addOnCompleteListener
                        }
                    }
                    val error = task.exception ?: Exception("Google sign-in failed")
                    onComplete(Result.failure(error))
                }
        } catch (e: Exception) {
            onComplete(Result.failure(e))
        }
    }

    /**
     * Signs in an existing user with Email and Password, and retrieves their profile from Cloud Firestore.
     * Uses Firebase Authentication as the only credential store.
     */
    fun loginUser(
        email: String,
        password: String,
        onComplete: (Result<UserProfile>) -> Unit
    ) {
        val cleanEmail = email.trim()
        val cleanPassword = password

        try {
            auth.signInWithEmailAndPassword(cleanEmail, cleanPassword)
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        val user = auth.currentUser ?: task.result?.user
                        if (user != null) {
                            FirestoreManager.getUserProfile(user.uid) { profileResult ->
                                if (profileResult.isFailure) {
                                    onComplete(Result.failure(profileResult.exceptionOrNull()
                                        ?: IllegalStateException("Could not load your Firestore profile.")))
                                    return@getUserProfile
                                }
                                val existing = profileResult.getOrNull()
                                val profile = existing ?: UserProfile(
                                    uid = user.uid,
                                    username = user.displayName ?: user.email?.substringBefore("@") ?: "Member",
                                    email = user.email.orEmpty()
                                )
                                if (existing == null) {
                                    FirestoreManager.saveUserProfile(profile) { saveResult ->
                                        saveResult.fold(
                                            onSuccess = { onComplete(Result.success(profile)) },
                                            onFailure = { cause ->
                                                auth.signOut()
                                                onComplete(Result.failure(IllegalStateException(
                                                    "Sign-in succeeded, but your Firestore profile could not be saved. Please sign in again to retry.",
                                                    cause
                                                )))
                                            }
                                        )
                                    }
                                } else {
                                    onComplete(Result.success(profile))
                                }
                            }
                            return@addOnCompleteListener
                        }
                    }
                    val error = task.exception ?: Exception("Login failed. Check your email and password.")
                    onComplete(Result.failure(error))
                }
        } catch (e: Exception) {
            onComplete(Result.failure(e))
        }
    }

    /**
     * Sends a password reset link to the given email address via Firebase Authentication.
     */
    fun sendPasswordReset(
        email: String,
        onComplete: (Result<Unit>) -> Unit
    ) {
        try {
            auth.sendPasswordResetEmail(email)
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        onComplete(Result.success(Unit))
                    } else {
                        val error = task.exception ?: Exception("Password reset failed")
                        onComplete(Result.failure(error))
                    }
                }
        } catch (e: Exception) {
            onComplete(Result.failure(e))
        }
    }

    /**
     * Signs out the currently authenticated user.
     */
    fun signOut() {
        try {
            auth.signOut()
        } catch (e: Exception) {
            // Ignored
        }
    }
}
