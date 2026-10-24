import { expect, test } from 'vitest'
import { isSafeExternalUrl } from '@core/url'

test('only http(s) links may be opened externally', () => {
  expect(isSafeExternalUrl('https://example.com/x')).toBe(true)
  expect(isSafeExternalUrl('http://localhost:3000')).toBe(true)
  expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
  expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
  expect(isSafeExternalUrl('smb://host/share')).toBe(false)
  expect(isSafeExternalUrl('not a url')).toBe(false)
})
