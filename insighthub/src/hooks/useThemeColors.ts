import { useMemo } from 'react'

export interface ThemeColors {
  bgCard: string
  bgCardHover: string
  textPrimary: string
  textSecondary: string
  textDim: string
  borderDefault: string
  accentBlue: string
  accentBlueLight: string
  accentGreen: string
  accentOrange: string
  accentRed: string
  accentPurple: string
  accentYellow: string
}

export function useThemeColors(): ThemeColors {
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    return {
      bgCard: cs.getPropertyValue('--bg-card').trim(),
      bgCardHover: cs.getPropertyValue('--bg-card-hover').trim(),
      textPrimary: cs.getPropertyValue('--text-primary').trim(),
      textSecondary: cs.getPropertyValue('--text-secondary').trim(),
      textDim: cs.getPropertyValue('--text-dim').trim(),
      borderDefault: cs.getPropertyValue('--border-default').trim(),
      accentBlue: cs.getPropertyValue('--accent-blue').trim(),
      accentBlueLight: cs.getPropertyValue('--accent-blue-light').trim(),
      accentGreen: cs.getPropertyValue('--accent-green').trim(),
      accentOrange: cs.getPropertyValue('--accent-orange').trim(),
      accentRed: cs.getPropertyValue('--accent-red').trim(),
      accentPurple: cs.getPropertyValue('--accent-purple').trim(),
      accentYellow: cs.getPropertyValue('--accent-yellow').trim(),
    }
  }, [])
}
