package com.example.syncedn.data.database

import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore

/** Shared Firestore document used by Android and web live song readers. */
object LiveSongSessionRepository {
    fun session(teamCode: String, serviceId: String): DocumentReference =
        FirebaseFirestore.getInstance()
            .collection("teams").document(teamCode.trim().uppercase())
            .collection("live_sessions").document(serviceId)
}

