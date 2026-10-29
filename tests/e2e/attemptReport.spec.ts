import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('exam results show where points were lost and read fractions as numbers', async () => {
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

  const ids = await win.evaluate(async () => {
    const call = async (path: string, input: unknown) => {
      const r = await window.bridge.invoke(path, input)
      if (!r.ok) throw new Error(r.error.message)
      return r.data as { id: string }
    }
    const courseId = decodeURIComponent(location.hash).match(/courses\/([^/?]+)/)![1]
    const graphs = await call('pages.create', { courseId, title: 'Scene graphs' })
    const unity = await call('pages.create', { courseId, title: 'Unity basics' })
    const t = await call('tests.create', {
      courseId,
      kind: 'exam',
      title: 'Quiz 1 Mock',
      questions: [
        { type: 'truefalse', prompt: 'Child transforms are relative to the parent.', truth: true, points: 2, sourcePageId: graphs.id },
        { type: 'single', prompt: 'Which node is the root?', options: ['Scene', 'Camera'], correct: [0], points: 2, sourcePageId: graphs.id },
        { type: 'number', prompt: 'Units per frame at 40 FPS with speed 6?', value: 0.15, tolerance: 0.001, points: 1, sourcePageId: unity.id }
      ]
    })
    const full = (await call('tests.get', { id: t.id })) as unknown as { questions: { id: string }[] }
    const [a, b, c] = full.questions.map((q) => q.id)
    await call('tests.submit', {
      testId: t.id,
      startedAt: new Date().toISOString(),
      answers: [
        { questionId: a, response: true },
        { questionId: b, response: 1 },
        { questionId: c, response: '3/20' }
      ]
    })
    return { courseId, testId: t.id }
  })

  await win.evaluate((h) => (location.hash = h), `#/courses/${ids.courseId}?tab=tests&test=${ids.testId}`)
  await win.getByRole('button', { name: 'Review' }).click()
  await expect(win.getByText('By topic')).toBeVisible()
  await expect(win.getByText('2 / 4 pts · 1 of 2 wrong')).toBeVisible()
  await expect(win.getByText('3/20 (= 0.15)')).toBeVisible()
  await expect(win.getByText("0.5 pts more for 3.0", { exact: false })).toBeVisible()
  if (process.env.UNIOS_SHOT) await win.screenshot({ path: process.env.UNIOS_SHOT })

  expect(errors).toEqual([])
  await app.close()
})
