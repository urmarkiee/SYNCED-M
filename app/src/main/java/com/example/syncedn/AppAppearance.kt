package com.example.syncedn

import android.content.Context
import android.content.res.Configuration
import android.view.Window
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.WindowCompat

/** Device appearance is separate from account preferences so signing out preserves it. */
object AppAppearance {
    private const val PREFS = "syncedm_appearance"
    fun mode(context: Context): String = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString("mode", "system").orEmpty()
    fun apply(context: Context) {
        AppCompatDelegate.setDefaultNightMode(when (mode(context)) {
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        })
    }
    fun setMode(context: Context, mode: String) {
        require(mode in listOf("system", "light", "dark"))
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("mode", mode).apply()
        apply(context)
    }
    fun isDark(context: Context) = context.resources.configuration.uiMode and
        Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    fun surface(context: Context, color: Int) = ThemePalette.surface(color, isDark(context))
    fun text(context: Context, color: Int) = ThemePalette.text(color, isDark(context))
    fun border(context: Context, color: Int) = if (isDark(context)) 0xFF454259.toInt() else color
    @Suppress("DEPRECATION")
    fun applyWindow(context: Context, window: Window) {
        val light = !isDark(context)
        window.statusBarColor = surface(context, 0xFFF8F7FB.toInt())
        window.navigationBarColor = surface(context, 0xFFFFFFFF.toInt())
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = light
            isAppearanceLightNavigationBars = light
        }
    }
}

/** Adapts the legacy View palette while leaving photos and dark hero artwork intact. */
object ThemePalette {
    private fun rgb(color: Int) = intArrayOf(color shr 16 and 255, color shr 8 and 255, color and 255)
    fun surface(color: Int, dark: Boolean): Int {
        if (!dark || color ushr 24 != 255) return color
        val c = rgb(color)
        if (c.minOrNull()!! < 180) return color
        return when {
            color == 0xFFFFFFFF.toInt() -> 0xFF202136.toInt()
            c.maxOrNull()!! - c.minOrNull()!! <= 12 -> 0xFF141522.toInt()
            c[0] > c[1] + 12 && c[0] > c[2] + 8 -> 0xFF412730.toInt()
            c[1] > c[0] + 8 -> 0xFF193A32.toInt()
            else -> 0xFF302B48.toInt()
        }
    }
    fun text(color: Int, dark: Boolean): Int {
        if (!dark || color ushr 24 != 255) return color
        val c = rgb(color)
        val high = c.maxOrNull()!!
        val low = c.minOrNull()!!
        // White/light labels are used on solid brand buttons and hero artwork.
        if (low >= 195) return color
        if (high - low < 60) return if (high < 100) 0xFFF2EFFA.toInt() else 0xFFBDB9CF.toInt()
        val r = (c[0] * .6 + 255 * .4).toInt()
        val g = (c[1] * .6 + 255 * .4).toInt()
        val b = (c[2] * .6 + 255 * .4).toInt()
        return (255 shl 24) or (r shl 16) or (g shl 8) or b
    }
}
