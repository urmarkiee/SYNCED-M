package com.example.syncedn.data.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import com.example.syncedn.shared.SyncedValidation

/**
 * Utility functions for input validation, network connectivity, and character constraints across Synced N.
 */
object ValidationUtils {
    const val MAX_NAME_LENGTH = SyncedValidation.MAX_NAME_LENGTH
    const val MAX_USERNAME_LENGTH = SyncedValidation.MAX_USERNAME_LENGTH
    const val MAX_PHONE_LENGTH = SyncedValidation.MAX_PHONE_LENGTH
    const val MAX_EMAIL_LENGTH = 60
    const val MAX_TITLE_LENGTH = 100
    const val MAX_REASON_LENGTH = 100

    /**
     * Checks if a phone number is a valid Philippine mobile number.
     * If allowBlank is true, an empty or blank string returns true (optional field).
     */
    fun isValidPhilippinePhone(phone: String, allowBlank: Boolean = true): Boolean {
        return SyncedValidation.isValidPhilippinePhone(phone, allowBlank)
    }

    /**
     * Checks if a name is valid (non-blank and within maximum character limit).
     */
    fun isValidName(name: String): Boolean {
        return SyncedValidation.isValidName(name)
    }

    /**
     * Checks if a username is valid (non-blank and within maximum character limit).
     */
    fun isValidUsername(username: String): Boolean {
        return SyncedValidation.isValidUsername(username)
    }

    /**
     * Verifies if the device has an active internet connection.
     */
    fun isNetworkAvailable(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            if (cm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val network = cm.activeNetwork ?: return false
                    val caps = cm.getNetworkCapabilities(network) ?: return false
                    caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                } else {
                    @Suppress("DEPRECATION")
                    val info = cm.activeNetworkInfo
                    info != null && info.isConnected
                }
            } else false
        } catch (_: Throwable) {
            true
        }
    }
}
