import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('crop an image block in a note', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unios-e2e-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, UNIOS_USER_DATA: join(dir, 'u'), UNIOS_DATA_DIR: join(dir, 'd') } })
  const win = await app.firstWindow()
  const errors: string[] = []
  win.on('pageerror', (e) => errors.push(e.message))
  await win.waitForLoadState('domcontentloaded')

  // A page with one stored 400×200 image (left half red, right half blue).
  const pageId = await win.evaluate(async () => {
    const call = async (path: string, input?: unknown) => {
      const r = await window.bridge.invoke(path, input)
      if (!r.ok) throw new Error(r.error.message)
      return r.data as never
    }
    const c = document.createElement('canvas')
    c.width = 400
    c.height = 200
    const g = c.getContext('2d')!
    g.fillStyle = '#ff0000'
    g.fillRect(0, 0, 200, 200)
    g.fillStyle = '#0000ff'
    g.fillRect(200, 0, 200, 200)
    const data = new Uint8Array(await (await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'))).arrayBuffer())
    const page: { id: string } = await call('pages.create', { courseId: null, title: 'Bilder' })
    const url: string = await call('assets.store', { pageId: page.id, name: 'chart.png', data })
    await call('pages.updateContent', {
      id: page.id,
      content: [{ id: 'img1', type: 'image', props: { url, name: 'chart.png', caption: '', previewWidth: 400, showPreview: true }, children: [] }]
    })
    return page.id
  })
  await win.evaluate((id) => (location.hash = `#/pages/${id}`), pageId)

  const img = win.locator('.bn-editor img').first()
  await expect(img).toBeVisible()
  await img.click()
  await win.getByRole('button', { name: 'Crop image' }).click()
  // The frame sits right on the image in the note.
  const cropper = win.getByRole('group', { name: 'Crop image' })
  await expect(cropper.getByRole('button', { name: 'Crop', exact: true })).toBeVisible()

  // Drag the left edge to the middle: only the blue half remains.
  const box = (await img.boundingBox())!
  await win.mouse.move(box.x + 1, box.y + box.height / 2)
  await win.mouse.down()
  await win.mouse.move(box.x + 1 + box.width / 2, box.y + box.height / 2, { steps: 8 })
  await win.mouse.up()
  await expect(cropper.getByText('200 × 200 px')).toBeVisible()
  await win.screenshot({ path: join(dir, 'cropping.png') })
  await cropper.getByRole('button', { name: 'Crop', exact: true }).click()
  await expect(cropper).toHaveCount(0)

  // The editor saves with a short delay.
  const props = () =>
    win.evaluate(async (id) => {
      const r = (await window.bridge.invoke('pages.get', { id })) as { data: { content: string } }
      return (JSON.parse(r.data.content) as { props: { url: string; previewWidth: number } }[])[0].props
    }, pageId)
  await expect.poll(async () => (await props()).previewWidth).toBe(200)
  const block = await props()
  const size = await win.evaluate(async (url) => {
    const im = new Image()
    im.src = url
    await im.decode()
    return [im.naturalWidth, im.naturalHeight]
  }, block.url)
  expect(size).toEqual([200, 200])
  await win.screenshot({ path: join(dir, 'after-crop.png') })
  console.log('screenshots in', dir)

  expect(errors).toEqual([])
  await app.close()
})
