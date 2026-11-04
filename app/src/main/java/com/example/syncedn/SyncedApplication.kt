package com.example.syncedn

import android.app.Application
import com.example.syncedn.data.auth.SessionManager
import com.example.syncedn.data.auth.SyncedFirebaseMessagingService
import com.example.syncedn.data.auth.SyncedMessagingService

/**
 * Application class to initialize background notification channels, FCM tokens,
 * and team topic subscriptions at startup so notifications work reliably when the app is closed.
 */
class SyncedApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppAppearance.apply(this)
        // Ensure notification channel is registered with system OS on startup
        SyncedMessagingService.ensureChannel(this)

        // Fetch/sync FCM device token and subscribe to active team topic for background alerts
        val prefs = getSharedPreferences(SessionManager.PREFS_NAME, MODE_PRIVATE)
        SyncedFirebaseMessagingService.syncToken(this, prefs)
        val teamCode = prefs.getString("teamCode", "").orEmpty()
        if (teamCode.isNotBlank()) {
            SyncedFirebaseMessagingService.subscribeToTeam(teamCode)
        }

        // Schedule periodic WorkManager background worker to check for notifications when app is closed
        com.example.syncedn.data.auth.SyncedNotificationWorker.schedulePeriodicWork(this)
    }
}
