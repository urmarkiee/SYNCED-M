package com.example.syncedn

import org.junit.Assert.*
import org.junit.Test

class ThemePaletteTest {
    @Test fun lightModePreservesOriginalColors() {
        for (color in listOf(0xFFFFFFFF, 0xFFF8F7FB, 0xFF1E1B38, 0xFF694CC4)) {
            assertEquals(color.toInt(), ThemePalette.surface(color.toInt(), false))
            assertEquals(color.toInt(), ThemePalette.text(color.toInt(), false))
        }
    }
    @Test fun darkModeMakesSurfacesDarkAndTextReadable() {
        assertEquals(0xFF202136.toInt(), ThemePalette.surface(0xFFFFFFFF.toInt(), true))
        assertEquals(0xFF141522.toInt(), ThemePalette.surface(0xFFF8F7FB.toInt(), true))
        assertEquals(0xFFF2EFFA.toInt(), ThemePalette.text(0xFF1E1B38.toInt(), true))
        assertEquals(0xFFBDB9CF.toInt(), ThemePalette.text(0xFF7B7689.toInt(), true))
    }
    @Test fun darkModePreservesWhiteButtonLabelsAndHeroOverlays() {
        assertEquals(0xFFFFFFFF.toInt(), ThemePalette.text(0xFFFFFFFF.toInt(), true))
        assertEquals(0xFF694CC4.toInt(), ThemePalette.surface(0xFF694CC4.toInt(), true))
        assertEquals(0x78000000, ThemePalette.surface(0x78000000, true))
    }
}
