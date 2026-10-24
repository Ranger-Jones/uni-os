import { useEffect, useState } from 'react'

const media = window.matchMedia('(prefers-color-scheme: dark)')

/** Main sets nativeTheme.themeSource from the user's setting, so the media query reflects the effective theme. */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(media.matches)
  useEffect(() => {
    const apply = () => {
      setDark(media.matches)
      document.documentElement.classList.toggle('dark', media.matches)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])
  return dark
}
