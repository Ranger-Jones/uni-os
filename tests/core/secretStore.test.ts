import { expect, test } from 'vitest'
import { linuxPasswordStore } from '@core/sync/secretStore'

test('tiling window managers use the Secret Service keyring (Electron would fall back to plain text there)', () => {
  expect(linuxPasswordStore({ XDG_CURRENT_DESKTOP: 'Hyprland' }, [])).toBe('gnome-libsecret')
  expect(linuxPasswordStore({}, [])).toBe('gnome-libsecret')
  expect(linuxPasswordStore({ XDG_CURRENT_DESKTOP: 'sway' }, [])).toBe('gnome-libsecret')
})

test('KDE keeps KWallet and an explicit --password-store wins', () => {
  expect(linuxPasswordStore({ XDG_CURRENT_DESKTOP: 'KDE' }, [])).toBeNull()
  expect(linuxPasswordStore({ XDG_CURRENT_DESKTOP: 'Hyprland' }, ['--password-store=basic'])).toBeNull()
})
