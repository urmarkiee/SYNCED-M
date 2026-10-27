package com.example.syncedn

import android.content.Context
import android.view.View
import android.widget.FrameLayout

/** Computes the existing 312:200 hero card proportions before layout, without a second traversal. */
internal class HomeHeroLayout(context: Context) : FrameLayout(context) {
    var card: View? = null
    var topContentHeightDp: Int = 190
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val cardHeight = maxOf(dp(196), ((width - dp(48)).coerceAtLeast(1) * 200f / 312f).toInt())
        // Mutate params within measurement; do not call setLayoutParams/requestLayout here.
        card?.layoutParams?.height = cardHeight
        val height = dp(topContentHeightDp) + cardHeight + dp(16)
        super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    }
}
