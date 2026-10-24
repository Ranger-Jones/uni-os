import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('create semester, course, note and assignment; see it on Today', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unios-e2e-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, UNIOS_USER_DATA: join(dir, 'u'), UNIOS_DATA_DIR: join(dir, 'd') } })
  const win = await app.firstWindow()
  const errors: string[] = []
  win.on('pageerror', (e) => errors.push(e.message))

  await win.getByText('Create your first semester').click()
  await win.getByRole('button', { name: 'Create semester' }).click()
  await win.getByText('Add a course').click()
  await win.getByLabel('Course name').fill('Analysis I')
  await win.getByRole('button', { name: 'Create course' }).click()
  await expect(win.getByRole('heading', { name: 'Analysis I' })).toBeVisible()

  await win.getByRole('tab', { name: 'Notes' }).click()
  await win.locator('main').getByRole('button', { name: 'New page' }).click()
  await win.getByPlaceholder('Untitled').fill('Vorlesung 1')
  await win.keyboard.press('Enter')
  await win.keyboard.type('Konvergenz von Folgen')
  await win.waitForTimeout(800)

  await win.getByText('Analysis I').first().click()
  await win.getByRole('tab', { name: 'Assignments' }).click()
  await win.getByRole('button', { name: 'New assignment' }).click()
  await win.getByLabel('Title').fill('Übungsblatt 1')
  const t = new Date(Date.now() + 86_400_000)
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  await win.getByLabel('Due date').fill(tomorrow)
  await win.getByRole('button', { name: 'Add assignment' }).click()

  await win.getByText('Today', { exact: true }).click()
  await expect(win.getByText('Übungsblatt 1')).toBeVisible()
  await expect(win.getByText(/Tomorrow/)).toBeVisible()

  await win.keyboard.press('Meta+k')
  await win.keyboard.type('konvergenz')
  await expect(win.getByRole('option', { name: /Vorlesung 1/ })).toBeVisible()

  expect(errors).toEqual([])
  await app.close()
})
