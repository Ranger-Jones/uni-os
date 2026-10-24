import { seed } from './seed-demo.mjs'
export default async function (win, out) {
  const ids = await seed(win)
  const [target, from] = await win.evaluate(async (ids) => {
    const a = (await window.bridge.invoke('pages.create', { courseId: ids.ana, title: 'Epipolargeometrie', icon: '📐' })).data
    const b = (await window.bridge.invoke('pages.create', { courseId: ids.ana, title: 'Lernplan Klausur' })).data
    return [a.id, b.id]
  }, ids)
  await win.reload()
  await win.evaluate((id) => (location.hash = `#/pages/${id}`), from)
  await win.waitForTimeout(700)
  await win.locator('.bn-editor').click()
  await win.keyboard.type('Zuerst wiederholen: ')
  await win.keyboard.type('[[epi')
  await win.waitForTimeout(600)
  await win.screenshot({ path: `${out}-menu.png` })
  await win.keyboard.press('Enter')
  await win.keyboard.type('und danach @Fundamentalmatrix')
  await win.waitForTimeout(600)
  await win.screenshot({ path: `${out}-menu2.png` })
  await win.keyboard.press('Enter') // only item: create new page
  await win.waitForTimeout(1200)
  await win.screenshot({ path: `${out}-chips.png` })
  const stored = await win.evaluate(async (id) => (await window.bridge.invoke('pages.get', { id })).data.contentText, from)
  console.log('STORED', JSON.stringify(stored))
  await win.getByRole('link', { name: /Epipolargeometrie/ }).click()
  await win.waitForTimeout(800)
  await win.screenshot({ path: `${out}-target.png` })
  console.log('NAVIGATED', await win.evaluate(() => location.hash), target)
}
