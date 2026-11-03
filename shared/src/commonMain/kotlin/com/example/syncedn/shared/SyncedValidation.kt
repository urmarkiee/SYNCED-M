package com.example.syncedn.shared

/** Platform-independent validation used by Android and the future iOS client. */
object SyncedValidation {
    const val MAX_NAME_LENGTH = 50
    const val MAX_USERNAME_LENGTH = 30
    const val MAX_PHONE_LENGTH = 13

    private val philippinePhoneRegex = Regex("""^(\+639\d{9}|639\d{9}|09\d{9})$""")

    fun isValidPhilippinePhone(phone: String, allowBlank: Boolean = true): Boolean {
        val clean = phone.trim()
        if (clean.isBlank()) return allowBlank
        return clean.matches(philippinePhoneRegex)
    }

    fun isValidName(name: String): Boolean {
        val clean = name.trim()
        return clean.isNotBlank() && clean.length <= MAX_NAME_LENGTH
    }

    fun isValidUsername(username: String): Boolean {
        val clean = username.trim()
        return clean.isNotBlank() && clean.length <= MAX_USERNAME_LENGTH
    }
}
