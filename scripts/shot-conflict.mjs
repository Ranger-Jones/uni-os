// I3 regression: while the user types in a page, a foreign writer (like Claude via MCP) appends a block.
// After the next autosave both the user's text and the foreign block must be in the stored page.
import { seed } from './seed-demo.mjs'
export default async function (win, out) {
  const ids = await seed(win)
  const id = await win.evaluate(async (ids) => (await window.bridge.invoke('pages.create', { courseId: ids.ana, title: 'Gemeinsam' })).data.id, ids)
  await win.evaluate((id) => (location.hash = `#/pages/${id}`), id)
  await win.waitForTimeout(700)
  await win.locator('.bn-editor').click()
  await win.keyboard.type('Meine erste Zeile')
  await win.waitForTimeout(900) // autosaved
  await win.evaluate(async (id) => {
    const p = (await window.bridge.invoke('pages.get', { id })).data
    const blocks = JSON.parse(p.content)
    blocks.push({ id: 'claude-1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Von Claude ergänzt', styles: {} }], children: [] })
    await window.bridge.invoke('pages.updateContent', { id, content: blocks })
  }, id)
  await win.keyboard.type(' und mehr')
  await win.waitForTimeout(1500)
  const text = await win.evaluate(async (id) => (await window.bridge.invoke('pages.get', { id })).data.contentText, id)
  console.log('STORED', JSON.stringify(text))
  await win.screenshot({ path: `${out}-merged.png` })
}
