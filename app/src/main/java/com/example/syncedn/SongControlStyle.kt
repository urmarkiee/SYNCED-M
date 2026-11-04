package com.example.syncedn

import android.content.res.ColorStateList
import android.content.res.Resources
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
import android.graphics.drawable.RippleDrawable

/** Compact visual surfaces with full-size touch targets. */
internal object SongControlStyle {
    val purple = Color.rgb(105, 76, 196)
    val ink = Color.rgb(30, 27, 56)
    val font = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    fun background(resources: Resources, primary: Boolean = false): InsetDrawable {
        val density = resources.displayMetrics.density
        val shape = GradientDrawable().apply {
            setColor(if (primary) purple else ThemePalette.surface(Color.rgb(246, 244, 250),
                resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK == android.content.res.Configuration.UI_MODE_NIGHT_YES))
            cornerRadius = 12 * density
        }
        val mask = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = 12 * density }
        val ripple = RippleDrawable(ColorStateList.valueOf(Color.argb(35, 126, 91, 220)), shape, mask)
        return InsetDrawable(ripple, (2 * density).toInt(), (6 * density).toInt(), (2 * density).toInt(), (6 * density).toInt())
    }
}
