'use client'

/**
 * Haptics helper — native vibration in the APK via Capacitor, silent no-op
 * on the web. Install @capacitor/haptics to enable; the app works without it.
 */

export async function haptic(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    const impact =
      style === 'heavy'
        ? ImpactStyle.Heavy
        : style === 'medium'
          ? ImpactStyle.Medium
          : ImpactStyle.Light
    await Haptics.impact({ style: impact })
  } catch {
    // Web browser or plugin not installed — ignore.
  }
}
