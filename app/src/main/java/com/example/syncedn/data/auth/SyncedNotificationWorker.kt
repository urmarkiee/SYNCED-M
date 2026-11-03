package com.example.syncedn.data.auth

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

/**
 * WorkManager background worker that periodically polls Firestore for new team alerts,
 * worship service updates, substitution requests, and chat messages while the app is closed.
 */
class SyncedNotificationWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = context.getSharedPreferences(SessionManager.PREFS_NAME, Context.MODE_PRIVATE)
        val teamCode = prefs.getString("teamCode", "").orEmpty().trim().uppercase()
        val userId = prefs.getString("userId", "").orEmpty().trim()

        if (teamCode.isBlank() || userId.isBlank()) {
            return Result.success()
        }

        val lastSync = prefs.getLong(KEY_LAST_NOTIF_SYNC, System.currentTimeMillis() - TimeUnit.HOURS.toMillis(1))
        val currentSyncTime = System.currentTimeMillis()

        try {
            val db = FirebaseFirestore.getInstance()

            // 1. Check for new or updated announcements
            val annSnap = db.collection("teams").document(teamCode)
                .collection("announcements")
                .get()
                .await()

            for (doc in annSnap.documents) {
                val updated = (doc.get("updatedAt") as? Number)?.toLong() ?: 0L
                val createdBy = doc.getString("createdBy").orEmpty()
                if (updated > lastSync && createdBy != userId) {
                    val title = doc.getString("title").orEmpty().ifBlank { "Team Announcement" }
                    val message = doc.getString("message").orEmpty()
                    val urgent = doc.getBoolean("urgent") ?: false
                    SyncedMessagingService.dispatchSystemNotification(
                        context = applicationContext,
                        preferences = prefs,
                        title = if (urgent) "🚨 URGENT: $title" else "📢 $title",
                        body = message
                    )
                }
            }

            // 2. Check for newly published or updated worship services
            val srvSnap = db.collection("teams").document(teamCode)
                .collection("services")
                .get()
                .await()

            for (doc in srvSnap.documents) {
                val status = doc.getString("status").orEmpty()
                val updated = (doc.get("updatedAt") as? Number)?.toLong() ?: 0L
                val createdBy = doc.getString("createdBy").orEmpty()
                if (status.equals("Published", ignoreCase = true) && updated > lastSync && createdBy != userId) {
                    val title = doc.getString("title").orEmpty().ifBlank { "Worship Service" }
                    val date = doc.getString("date").orEmpty()
                    val start = doc.getString("start").orEmpty()
                    val venue = doc.getString("venue").orEmpty()
                    SyncedMessagingService.dispatchSystemNotification(
                        context = applicationContext,
                        preferences = prefs,
                        title = "📅 Service Update: $title",
                        body = "$date ($start) at $venue"
                    )
                }
            }

            // 3. Check for substitution requests or status changes
            val subSnap = db.collection("teams").document(teamCode)
                .collection("substitutions")
                .get()
                .await()

            for (doc in subSnap.documents) {
                val updated = (doc.get("updatedAt") as? Number)?.toLong() ?: 0L
                val requesterUid = doc.getString("requesterUid").orEmpty()
                val substituteUid = doc.getString("substituteUid").orEmpty()
                val status = doc.getString("status").orEmpty()
                val role = doc.getString("role").orEmpty()
                val serviceTitle = doc.getString("serviceTitle").orEmpty().ifBlank { "Worship Service" }
                val substituteName = doc.getString("substituteName").orEmpty().ifBlank { "A teammate" }

                if (updated > lastSync) {
                    val userRole = prefs.getString("role", "Member").orEmpty()
                    if (status.equals("Pending", ignoreCase = true) && requesterUid != userId &&
                        (substituteUid == userId || userRole.equals("Leader", true))
                    ) {
                        val requesterName = doc.getString("requesterName").orEmpty().ifBlank { "A teammate" }
                        SyncedMessagingService.dispatchSystemNotification(
                            context = applicationContext,
                            preferences = prefs,
                            title = "🔄 Substitution Request",
                            body = "$requesterName requested coverage for $role in $serviceTitle."
                        )
                    } else if (status.equals("Accepted", ignoreCase = true) && requesterUid == userId) {
                        SyncedMessagingService.dispatchSystemNotification(
                            context = applicationContext,
                            preferences = prefs,
                            title = "✅ Substitution Accepted",
                            body = "$substituteName accepted to cover $role in $serviceTitle."
                        )
                    }
                }
            }

            // 4. Check for new team chat messages
            val msgSnap = db.collection("teams").document(teamCode)
                .collection("messages")
                .get()
                .await()

            for (doc in msgSnap.documents) {
                val timestamp = (doc.get("timestamp") as? Number)?.toLong() ?: 0L
                val senderUid = doc.getString("senderUid").orEmpty()
                if (timestamp > lastSync && senderUid.isNotBlank() && senderUid != userId) {
                    val senderName = doc.getString("senderName").orEmpty().ifBlank { "Team Member" }
                    val text = doc.getString("text").orEmpty().ifBlank { "📷 Sent an image" }
                    SyncedMessagingService.dispatchSystemNotification(
                        context = applicationContext,
                        preferences = prefs,
                        title = "💬 $senderName",
                        body = text,
                        isChatMessage = true
                    )
                }
            }

            prefs.edit().putLong(KEY_LAST_NOTIF_SYNC, currentSyncTime).apply()
            return Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Error in background notification worker", e)
            return Result.retry()
        }
    }

    companion object {
        private const val TAG = "SyncedNotifWorker"
        const val WORK_NAME = "SyncedNotificationPeriodicWork"
        private const val KEY_LAST_NOTIF_SYNC = "last_notification_sync_timestamp"

        /**
         * Schedules periodic background polling using WorkManager (minimum 15-minute interval).
         */
        fun schedulePeriodicWork(context: Context) {
            try {
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()

                val workRequest = PeriodicWorkRequestBuilder<SyncedNotificationWorker>(
                    15, TimeUnit.MINUTES
                )
                    .setConstraints(constraints)
                    .build()

                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    workRequest
                )
                Log.d(TAG, "Enqueued periodic WorkManager notification worker.")
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to schedule WorkManager notification worker", e)
            }
        }
    }
}
