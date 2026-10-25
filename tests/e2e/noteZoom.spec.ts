/// <reference lib="dom" />
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('zoom a note with the keyboard and the slider', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unios-e2e-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, UNIOS_USER_DATA: join(dir, 'u'), UNIOS_DATA_DIR: join(dir, 'd') } })
  const win = await app.firstWindow()
  const errors: string[] = []
  win.on('pageerror', (e) => errors.push(e.message))
  await win.waitForLoadState('domcontentloaded')

  const pageId = await win.evaluate(async () => {
    const call = async (path: string, input?: unknown) => {
      const r = await window.bridge.invoke(path, input)
      if (!r.ok) throw new Error(r.error.message)
      return r.data as never
    }
    const page: { id: string } = await call('pages.create', { courseId: null, title: 'Zoom' })
    await call('pages.updateContent', {
      id: page.id,
      content: [{ id: 'p1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Hallo Welt', styles: {} }], children: [] }]
    })
    return page.id
  })
  await win.evaluate((id) => (location.hash = `#/pages/${id}`), pageId)

  const para = win.getByText('Hallo Welt')
  await expect(para).toBeVisible()
  const before = (await para.boundingBox())!.height
  await win.keyboard.press('ControlOrMeta+=')
  await win.keyboard.press('ControlOrMeta+=')
  expect((await para.boundingBox())!.height).toBeGreaterThan(before * 1.1)
  // Zooming shows the overlay briefly, and never beyond 150 %.
  const hud = win.locator('[aria-hidden="false"]').getByRole('slider', { name: 'Zoom' })
  await expect(hud).toBeVisible()
  await win.screenshot({ path: process.env.ZOOM_SHOT ?? join(dir, 'zoom.png') })
  for (let i = 0; i < 6; i++) await win.keyboard.press('ControlOrMeta+=')
  await expect(hud).toHaveAttribute('aria-valuetext', '150 %')
  for (let i = 0; i < 3; i++) await win.keyboard.press('ControlOrMeta+-')
  // Hovering keeps the overlay open so the slider can be dragged.
  await hud.hover()
  await win.waitForTimeout(2000)
  await expect(hud).toBeVisible()
  await hud.press('ArrowLeft')
  await expect(hud).toHaveAttribute('aria-valuetext', '110 %')
  await win.mouse.move(5, 600)
  // The zoom overlay (not the reading-progress pill, which is also a fixed element with aria-hidden) hides again.
  await expect(win.locator('div.fixed[aria-hidden]').filter({ hasText: 'Zoom' })).toHaveAttribute('aria-hidden', 'true', { timeout: 3000 })

  await win.getByRole('button', { name: 'Page actions' }).click()
  const slider = win.getByRole('menu').getByRole('slider', { name: 'Zoom' })
  await expect(slider).toHaveAttribute('aria-valuetext', '110 %')
  // The left end of the track is the minimum.
  const box = (await slider.boundingBox())!
  await win.mouse.click(box.x + 4, box.y + box.height / 2)
  await expect(slider).toHaveAttribute('aria-valuetext', '50 %')
  await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuetext', '60 %')
  await slider.dblclick()
  await expect(slider).toHaveAttribute('aria-valuetext', '100 %')

  expect(errors).toEqual([])
  await app.close()
})
