import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

/** A two-finger trackpad swipe: Chromium reports it as a burst of horizontal wheel events. */
async function swipe(win: Page, direction: 'back' | 'forward') {
  await win.mouse.move(700, 400)
  for (let i = 0; i < 16; i++) await win.mouse.wheel(direction === 'back' ? -15 : 15, 0)
  await win.waitForTimeout(300) // gesture ends
}
const hash = (win: Page) => win.evaluate(() => decodeURIComponent(location.hash))

test('swipe back returns from a linked page and from a source opened in exam results', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unios-e2e-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, UNIOS_USER_DATA: join(dir, 'u'), UNIOS_DATA_DIR: join(dir, 'd') } })
  const win = await app.firstWindow()
  const errors: string[] = []
  win.on('pageerror', (e) => errors.push(e.message))

  await win.getByText('Create your first semester').click()
  await win.getByRole('button', { name: 'Create semester' }).click()
  await win.getByText('Add a course').click()
  await win.getByLabel('Course name').fill('Virtual Reality')
  await win.getByRole('button', { name: 'Create course' }).click()
  await expect(win.getByRole('heading', { name: 'Virtual Reality' })).toBeVisible()

  // a test whose question links to a source page, with one finished attempt
  const ids = await win.evaluate(async () => {
    const call = async (path: string, input: unknown) => {
      const r = await window.bridge.invoke(path, input)
      if (!r.ok) throw new Error(r.error.message)
      return r.data as { id: string }
    }
    const courseId = decodeURIComponent(location.hash).match(/courses\/([^/?]+)/)![1]
    const page = await call('pages.create', { courseId, title: 'Scene graphs' })
    const t = await call('tests.create', {
      courseId,
      kind: 'exam',
      title: 'Quiz 1 Mock',
      questions: [{ type: 'truefalse', prompt: 'Child transforms are relative to the parent.', truth: true, sourcePageId: page.id }]
    })
    const full = (await call('tests.get', { id: t.id })) as unknown as { questions: { id: string }[] }
    await call('tests.submit', { testId: t.id, startedAt: new Date().toISOString(), answers: [{ questionId: full.questions[0].id, response: true }] })
    return { courseId, pageId: page.id, testId: t.id }
  })

  // page → linked page → swipe back
  await win.getByRole('tab', { name: 'Notes' }).click()
  await win.getByText('Scene graphs').first().click()
  await expect.poll(() => hash(win)).toContain(`/pages/${ids.pageId}`)
  await win.getByRole('tab', { name: 'Notes' }).waitFor({ state: 'detached' })
  await swipe(win, 'back')
  await expect.poll(() => hash(win)).toContain(`/courses/${ids.courseId}`)
  await swipe(win, 'forward')
  await expect.poll(() => hash(win)).toContain(`/pages/${ids.pageId}`)

  // exam results → "Open the source page" → swipe back lands on the same results again
  await win.evaluate((h) => (location.hash = h), `#/courses/${ids.courseId}?tab=tests&test=${ids.testId}`)
  await win.getByRole('button', { name: 'Review' }).click()
  await expect(win.getByText('Open the source page')).toBeVisible()
  await win.getByText('Open the source page').click()
  await expect.poll(() => hash(win)).toContain(`/pages/${ids.pageId}`)
  await swipe(win, 'back')
  await expect(win.getByText('Open the source page')).toBeVisible()

  // a vertical scroll never navigates
  for (let i = 0; i < 10; i++) await win.mouse.wheel(0, 40)
  await win.waitForTimeout(300)
  await expect(win.getByText('Open the source page')).toBeVisible()

  expect(errors).toEqual([])
  await app.close()
})
