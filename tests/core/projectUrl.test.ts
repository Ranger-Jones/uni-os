import { expect, test } from 'vitest'
import { authErrorMessage, projectUrl } from '@core/sync/projectUrl'

test('keeps a project API URL and strips paths', () => {
  expect(projectUrl('https://abcdefghijklmnop.supabase.co')).toBe('https://abcdefghijklmnop.supabase.co')
  expect(projectUrl(' https://abcdefghijklmnop.supabase.co/rest/v1/ ')).toBe('https://abcdefghijklmnop.supabase.co')
  expect(projectUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321')
})

test('turns a dashboard link into the project API URL', () => {
  expect(projectUrl('https://supabase.com/dashboard/project/fahkyaquwolbvmpkqyfn')).toBe('https://fahkyaquwolbvmpkqyfn.supabase.co')
  expect(projectUrl('https://supabase.com/dashboard/project/fahkyaquwolbvmpkqyfn/settings/api')).toBe('https://fahkyaquwolbvmpkqyfn.supabase.co')
  expect(projectUrl('fahkyaquwolbvmpkqyfn.supabase.co')).toBe('https://fahkyaquwolbvmpkqyfn.supabase.co')
})

test('rejects other supabase.com pages, plain http and garbage', () => {
  expect(() => projectUrl('https://supabase.com/dashboard/projects')).toThrow(/supabase\.co/)
  expect(() => projectUrl('http://example.com')).toThrow(/https/)
  expect(() => projectUrl('not a url')).toThrow(/supabase\.co/)
})

test('explains a non-Supabase answer instead of a JSON parse error', () => {
  expect(authErrorMessage(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`)).toMatch(/project URL/i)
  expect(authErrorMessage('Email not confirmed')).toMatch(/Confirm your email/)
  expect(authErrorMessage('Invalid login credentials')).toBe('Invalid login credentials')
})
