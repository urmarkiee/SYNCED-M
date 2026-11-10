package com.example.syncedn

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Fixed song-page footer: controls stay reachable while lyrics or chords scroll. */
internal class SheetAutoScrollControls(
    context: Context,
    private val preferences: SharedPreferences,
    song: String,
    private var viewport: StableScrollView?,
    private val sheet: TextView,
    private val onTranspose: () -> Unit
) : LinearLayout(context) {
    private val fontKey = "sheet_font_size_$song"
    private val fontMigrationKey = "sheet_font_default_18_migrated"
    private var fontSize = preferences.getInt(fontKey, 18).coerceIn(12, 18)
    private val speedKey = "sheet_scroll_speed_$song"
    private var speed = SheetScrollClock.clampSpeed(preferences.getInt(speedKey, 3))
    private val clock = SheetScrollClock()
    private var running = false
    private var liveSyncActive = false
    private var closed = false
    private var lastFrame = 0L
    private val sheetLocation = IntArray(2)
    private val scrollLocation = IntArray(2)
    private val navy = AppAppearance.text(context, Color.rgb(30, 27, 56))
    private val status = label("Ready", 11)
    private lateinit var speedLabel: TextView
    private lateinit var speedDown: Button
    private lateinit var speedUp: Button
    private lateinit var transposeButton: Button
    private val toggle = Button(context).apply {
        text = "Auto-scroll"; textSize = 12f; isAllCaps = false
        setSingleLine(true); ellipsize = android.text.TextUtils.TruncateAt.END
        setTextColor(Color.WHITE)
        background = SongControlStyle.background(resources, true)
        typeface = SongControlStyle.font
        minWidth = 0; minimumWidth = 0; minHeight = 0; minimumHeight = 0
        setPadding(0,0,0,0); stateListAnimator = null
        setOnClickListener { if (running) pause() else start() }
    }
    private val manualScroll: () -> Unit = { pause() }
    private val frame = object : Runnable {
        override fun run() {
            val scroll = viewport
            if (!running || closed || !isAttachedToWindow || scroll == null) return
            val now = SystemClock.uptimeMillis()
            val maximum = maximumOffset(scroll)
            val nextY = clock.advance(now - lastFrame, speed, resources.displayMetrics.density, maximum)
            scroll.scrollTo(0, nextY)
            lastFrame = now
            if (nextY >= maximum) pause("End of sheet")
            else postOnAnimation(this)
        }
    }

    init {
        orientation = VERTICAL
        setBackgroundColor(AppAppearance.surface(context, Color.WHITE))
        setPadding(dp(16),dp(4),dp(16),dp(4))
        elevation = dp(1).toFloat()
        if (!preferences.getBoolean(fontMigrationKey, false)) {
            val editor = preferences.edit()
            preferences.all.forEach { (key, value) ->
                if (key.startsWith("sheet_font_size_") && value is Int) editor.putInt(key, 18)
            }
            editor.putBoolean(fontMigrationKey, true).apply()
        }
        fontSize = preferences.getInt(fontKey, 18).coerceIn(12, 18)
        sheet.textSize = fontSize.toFloat()
        preferences.edit().putInt(fontKey, fontSize).apply()
        clipChildren = true; clipToPadding = true
        addView(LinearLayout(context).apply {
            gravity = Gravity.CENTER_VERTICAL
            addView(toggle, LayoutParams(0,dp(44),1.05f))
            addView(LinearLayout(context).apply {
                gravity = Gravity.CENTER
                speedDown = selectorButton("−", "Decrease automatic scroll speed") { changeSpeed(-1) }
                speedLabel = label("Speed $speed", 12).apply {
                    contentDescription = "Auto-scroll speed $speed of 10"
                }
                speedUp = selectorButton("+", "Increase automatic scroll speed") { changeSpeed(1) }
                addView(speedDown, LayoutParams(dp(34), dp(44)))
                addView(speedLabel, LayoutParams(0, dp(44), 1f))
                addView(speedUp, LayoutParams(dp(34), dp(44)))
            }, LayoutParams(0,dp(44),1.15f).apply { marginStart = dp(4) })
            transposeButton = selectorButton("Key", "Choose transpose key") { onTranspose() }
            addView(transposeButton, LayoutParams(0,dp(44),0.9f).apply { marginStart = dp(4) })
        }, LayoutParams(-1,dp(44)))
        updateSpeedControls()
        status.visibility = View.GONE
        viewport?.onManualScroll = manualScroll
    }

    private fun selectorButton(title: String, description: String, action: () -> Unit) = Button(context).apply {
        text = title; textSize = 13f; isAllCaps = false
        setSingleLine(true); ellipsize = android.text.TextUtils.TruncateAt.END
        contentDescription = description; typeface = SongControlStyle.font
        setTextColor(navy); background = SongControlStyle.background(resources)
        minWidth = 0; minimumWidth = 0; minHeight = 0; minimumHeight = 0
        setPadding(0,0,0,0); stateListAnimator = null
        setOnClickListener { action() }
    }

    private fun changeSpeed(delta: Int) {
        speed = (speed + delta).coerceIn(1, 10)
        speedLabel.text = "Speed $speed"
        speedLabel.contentDescription = "Auto-scroll speed $speed of 10"
        updateSpeedControls()
        if (running) status.text = "Scrolling at speed $speed"
        preferences.edit().putInt(speedKey, speed).apply()
    }

    private fun updateSpeedControls() {
        speedDown.isEnabled = speed > 1
        speedUp.isEnabled = speed < 10
        speedDown.alpha = if (speedDown.isEnabled) 1f else 0.35f
        speedUp.alpha = if (speedUp.isEnabled) 1f else 0.35f
    }

    fun setTransposeKey(key: String) {
        transposeButton.text = "Key $key"
        transposeButton.contentDescription = "Current song key $key. Tap to transpose."
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun label(value: String, size: Int) = TextView(context).apply {
        text = value; textSize = size.toFloat(); setTextColor(navy)
        includeFontPadding = true; gravity = Gravity.CENTER
        setSingleLine(true); ellipsize = android.text.TextUtils.TruncateAt.END
    }

    private fun sheetTop(scroll: StableScrollView): Int {
        sheet.getLocationInWindow(sheetLocation)
        scroll.getLocationInWindow(scrollLocation)
        return (sheetLocation[1] - scrollLocation[1] + scroll.scrollY).coerceAtLeast(0)
    }

    private fun maximumOffset(scroll: StableScrollView): Int {
        val visibleHeight = (scroll.height - scroll.paddingBottom).coerceAtLeast(1)
        val contentMaximum = ((scroll.getChildAt(0)?.bottom ?: 0) - visibleHeight).coerceAtLeast(0)
        val top = sheetTop(scroll)
        val sheetBottom = top + sheet.height
        val reachableSheetTop = top.coerceAtMost(contentMaximum)
        return (sheetBottom - visibleHeight).coerceAtMost(contentMaximum).coerceAtLeast(reachableSheetTop)
    }

    private fun start() {
        val scroll = viewport ?: return
        if (closed || liveSyncActive || !isAttachedToWindow) return
        if (sheet.height == 0 || scroll.height == 0) {
            status.text = "Sheet is still loading"
            return
        }
        // Cancel any native fling before beginning paced scrolling.
        scroll.fling(0)
        val top = sheetTop(scroll)
        val maximum = maximumOffset(scroll)
        val sheetStart = top.coerceAtMost(maximum)
        val start = if (scroll.scrollY >= maximum - dp(8)) sheetStart else scroll.scrollY.coerceIn(sheetStart, maximum)
        scroll.scrollTo(0, start)
        if (maximum <= start) { pause("Entire sheet is visible"); return }
        clock.reset(start); lastFrame = SystemClock.uptimeMillis()
        running = true; keepScreenOn = true
        toggle.text = "Pause scroll"; status.text = "Scrolling"
        removeCallbacks(frame); postOnAnimation(frame)
    }

    fun setLiveSyncActive(active: Boolean) {
        liveSyncActive = active
        toggle.isEnabled = !active
        toggle.alpha = if (active) 0.45f else 1f
        if (active) pause("Live sync uses manual scrolling")
        else if (!running) status.text = "Ready"
    }

    fun pause(message: String = "Paused") {
        running = false; keepScreenOn = false; removeCallbacks(frame)
        toggle.text = "Auto-scroll"; status.text = message
    }

    fun close() {
        pause(); closed = true
        preferences.edit().putInt(speedKey, speed).apply()
        viewport?.let { if (it.onManualScroll === manualScroll) it.onManualScroll = null }
        viewport = null
    }

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(visibility)
        if (visibility != View.VISIBLE && running) pause("Paused in background")
    }

    override fun onDetachedFromWindow() { close(); super.onDetachedFromWindow() }
}
