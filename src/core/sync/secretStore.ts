/**
 * Which Linux keyring Electron's safeStorage should use. Electron only picks a keyring on desktops it
 * knows (GNOME, KDE, …); on tiling window managers like Hyprland or sway it silently falls back to
 * plain text even when gnome-keyring or KeePassXC is running, so ask for the Secret Service there.
 */
export function linuxPasswordStore(env: Record<string, string | undefined>, argv: string[]): string | null {
  if (argv.some((a) => a.startsWith('--password-store'))) return null
  if (/kde/i.test(env.XDG_CURRENT_DESKTOP ?? '') || /kde/i.test(env.DESKTOP_SESSION ?? '')) return null
  return 'gnome-libsecret'
}
