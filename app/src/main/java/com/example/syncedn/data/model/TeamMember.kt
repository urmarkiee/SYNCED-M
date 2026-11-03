package com.example.syncedn.data.model

/**
 * Represents a member of a team in Cloud Firestore.
 * Used for team roster display, ministry role assignment, and scheduling.
 */
data class TeamMember(
    val uid: String = "",
    val fullName: String = "",
    val username: String = "",
    val email: String = "",
    val role: String = "Member",
    val ministryRole: String = "",
    val teamCode: String = "",
    val photoUri: String = "",
    val unavailableRanges: List<UnavailableRange> = emptyList(),
    val joinedAt: Long = System.currentTimeMillis(),
    val removedByLeader: Boolean = false
) {
    /** Name to show in roster UI, preferring actual names over generic role labels. */
    val displayName: String
        get() = sequenceOf(fullName, username, email.substringBefore('@'))
            .map(String::trim)
            .firstOrNull { it.isNotBlank() && !it.equals("Member", ignoreCase = true) && !it.equals("User", ignoreCase = true) }
            ?: "Member"

    fun toMap(): Map<String, Any> = mapOf(
        "uid" to uid,
        "fullName" to fullName,
        "username" to username,
        "email" to email,
        "role" to role,
        "ministryRole" to ministryRole,
        "teamCode" to teamCode,
        "photoUri" to photoUri,
        "unavailableRanges" to unavailableRanges.map { it.toMap() },
        "joinedAt" to joinedAt,
        "removedByLeader" to removedByLeader
    )

    companion object {
        fun fromMap(map: Map<String, Any?>): TeamMember {
            val ranges = UnavailableRange.parseList(map["unavailableRanges"])
            // Older web and Android builds have used slightly different profile name keys.
            // Read them all so an older profile still displays its real name in the roster.
            fun string(vararg keys: String): String = keys
                .asSequence()
                .mapNotNull { key -> map[key] as? String }
                .map(String::trim)
                .firstOrNull { it.isNotBlank() }
                .orEmpty()
            val username = string("username", "userName", "displayName", "display_name")
            val rawFullName = string("fullName", "full_name", "name", "displayName", "display_name")
            val fullName = if (rawFullName.equals("Member", ignoreCase = true) || rawFullName.equals("User", ignoreCase = true)) {
                username.ifBlank { rawFullName }
            } else rawFullName

            return TeamMember(
                uid = map["uid"] as? String ?: "",
                fullName = fullName,
                username = username,
                email = map["email"] as? String ?: "",
                role = map["role"] as? String ?: "Member",
                ministryRole = map["ministryRole"] as? String ?: "",
                teamCode = map["teamCode"] as? String ?: "",
                photoUri = map["photoUri"] as? String ?: "",
                unavailableRanges = ranges,
                joinedAt = (map["joinedAt"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                removedByLeader = map["removedByLeader"] as? Boolean ?: false
            )
        }
    }
}
