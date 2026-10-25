/// <reference lib="dom" />
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// BlockNote positions its menus from screen coordinates; under the note zoom they must still sit on the table.
test('table handles and side menu stay on a zoomed note', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unios-e2e-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, UNIOS_USER_DATA: join(dir, 'u'), UNIOS_DATA_DIR: join(dir, 'd') } })
  const win = await app.firstWindow()
  const errors: string[] = []
  win.on('pageerror', (e) => errors.push(e.message))
  await win.waitForLoadState('domcontentloaded')

  const cell = (text: string) => ({ type: 'tableCell', props: {}, content: [{ type: 'text', text, styles: {} }] })
  const pageId = await win.evaluate(
    async (rows) => {
      const call = async (path: string, input?: unknown) => {
        const r = await window.bridge.invoke(path, input)
        if (!r.ok) throw new Error(r.error.message)
        return r.data as never
      }
      const page: { id: string } = await call('pages.create', { courseId: null, title: 'Tabelle' })
      await call('pages.updateContent', {
        id: page.id,
        content: [
          { id: 'p1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Vorher', styles: {} }], children: [] },
          { id: 't1', type: 'table', props: {}, content: { type: 'tableContent', rows: rows.map((cells) => ({ cells })) }, children: [] }
        ]
      })
      return page.id
    },
    [0, 1, 2, 3, 4].map((r) => [cell(`Merkmal ${r}`), cell(`Effizient ${r}`), cell(`Responsiv ${r}`)])
  )
  await win.evaluate((id) => (location.hash = `#/pages/${id}`), pageId)

  const table = win.locator('.bn-editor table').first()
  await expect(table).toBeVisible()
  for (let i = 0; i < 5; i++) await win.keyboard.press('ControlOrMeta+=')
  await expect(win.locator('[aria-hidden="false"]').getByRole('slider', { name: 'Zoom' })).toHaveAttribute('aria-valuetext', '150 %')

  await win.waitForTimeout(400) // the column width animates with the zoom
  const target = win.getByText('Effizient 4')
  const tb = (await table.boundingBox())!
  const cb = (await target.boundingBox())!
  await win.mouse.move(cb.x + 5, cb.y + cb.height / 2)
  await win.mouse.move(cb.x + 10, cb.y + cb.height / 2)

  // The block side menu sits just left of the blocks' text edge, at the table's top.
  const side = win.locator('.bn-side-menu')
  await expect(side).toBeVisible()
  const sb = (await side.boundingBox())!
  const textLeft = (await win.getByText('Vorher').boundingBox())!.x
  expect(textLeft - (sb.x + sb.width)).toBeGreaterThanOrEqual(-2)
  expect(textLeft - (sb.x + sb.width)).toBeLessThan(20)
  expect(Math.abs(sb.y - tb.y)).toBeLessThan(30)

  // The row handle straddles the table's left edge at the hovered row, the column handle its top edge.
  const handles = await win.locator('.bn-table-handle').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))
  const rowHandle = handles.find((h) => h.height > h.width)!
  const colHandle = handles.find((h) => h.width > h.height)!
  expect(Math.abs(rowHandle.x + rowHandle.width / 2 - tb.x)).toBeLessThan(6)
  expect(Math.abs(rowHandle.y + rowHandle.height / 2 - (cb.y + cb.height / 2))).toBeLessThan(10)
  expect(Math.abs(colHandle.y + colHandle.height / 2 - tb.y)).toBeLessThan(6)
  expect(colHandle.x).toBeGreaterThan(tb.x)
  expect(colHandle.x + colHandle.width).toBeLessThan(tb.x + tb.width)

  // Right below the table, the add-row button spans its width.
  await win.mouse.move(cb.x + 10, tb.y + tb.height + 4)
  const extend = win.locator('.bn-extend-button-add-remove-rows')
  await expect(extend).toBeVisible()
  const eb = (await extend.boundingBox())!
  await win.screenshot({ path: process.env.ZOOM_SHOT ?? join(dir, 'zoom-table.png') })
  expect(Math.abs(eb.x - tb.x)).toBeLessThan(4)
  expect(Math.abs(eb.width - tb.width)).toBeLessThan(4)
  expect(Math.abs(eb.y - (tb.y + tb.height))).toBeLessThan(8)

  expect(errors).toEqual([])
  await app.close()
})
