package com.example.syncedn

import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.Drawable
import androidx.appcompat.widget.SwitchCompat

/** A native accessible switch with a sun/moon thumb and an animated sliding position. */
class AppearanceSwitch(context: Context) : SwitchCompat(context) {
    init {
        val density = resources.displayMetrics.density
        showText = false
        splitTrack = false
        switchMinWidth = (72 * density).toInt()
        minimumHeight = (48 * density).toInt()
        thumbDrawable = AppearanceDrawable(density, true)
        trackDrawable = AppearanceDrawable(density, false)
        thumbTintList = null
        trackTintList = null
        contentDescription = "Dark mode"
        setPadding(0, 0, 0, 0)
    }
}

private class AppearanceDrawable(private val density: Float, private val thumb: Boolean) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var dark = false
    override fun isStateful() = true
    override fun onStateChange(state: IntArray): Boolean {
        val next = state.contains(android.R.attr.state_checked)
        if (dark == next) return false
        dark = next
        invalidateSelf()
        return true
    }
    override fun getIntrinsicWidth() = ((if (thumb) 28 else 72) * density).toInt()
    override fun getIntrinsicHeight() = ((if (thumb) 28 else 36) * density).toInt()
    override fun getPadding(padding: Rect): Boolean {
        if (thumb) { padding.set(0, 0, 0, 0); return false }
        val inset = (4 * density).toInt()
        padding.set(inset, inset, inset, inset)
        return true
    }
    override fun draw(canvas: Canvas) {
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        paint.style = Paint.Style.FILL
        if (thumb) {
            paint.color = 0xFFFFFFFF.toInt()
            canvas.drawCircle(cx, cy, 14 * density, paint)
            icon(canvas, cx, cy, dark, if (dark) 0xFF694CC4.toInt() else 0xFF946014.toInt(), true)
        } else {
            paint.color = if (dark) 0xFF694CC4.toInt() else 0xFFE4DFEE.toInt()
            val height = 36 * density
            canvas.drawRoundRect(bounds.left.toFloat(), cy - height / 2, bounds.right.toFloat(), cy + height / 2, height / 2, height / 2, paint)
            icon(canvas, if (dark) bounds.left + 18 * density else bounds.right - 18 * density,
                cy, !dark, if (dark) 0xFFE8DEFF.toInt() else 0xFF706681.toInt(), false)
        }
    }
    private fun icon(canvas: Canvas, cx: Float, cy: Float, moon: Boolean, color: Int, onThumb: Boolean) {
        paint.style = Paint.Style.FILL
        paint.color = color
        if (moon) {
            canvas.drawCircle(cx, cy, 6 * density, paint)
            paint.color = if (onThumb) 0xFFFFFFFF.toInt() else 0xFFE4DFEE.toInt()
            canvas.drawCircle(cx + 3 * density, cy - 2 * density, 5 * density, paint)
        } else {
            canvas.drawCircle(cx, cy, 3.5f * density, paint)
            paint.strokeWidth = 1.4f * density
            paint.strokeCap = Paint.Cap.ROUND
            for (i in 0..7) {
                val angle = i * Math.PI / 4
                canvas.drawLine(cx + (Math.cos(angle) * 5.5 * density).toFloat(), cy + (Math.sin(angle) * 5.5 * density).toFloat(),
                    cx + (Math.cos(angle) * 7.5 * density).toFloat(), cy + (Math.sin(angle) * 7.5 * density).toFloat(), paint)
            }
        }
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha; invalidateSelf() }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter; invalidateSelf() }
    @Suppress("DEPRECATION")
    @Deprecated("Deprecated in Java")
    override fun getOpacity() = PixelFormat.TRANSLUCENT
}
