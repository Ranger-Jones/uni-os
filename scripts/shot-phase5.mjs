import { writeFileSync } from 'node:fs'
import { seed } from './seed-demo.mjs'
import { makePdfBytes } from './pdf-fixture.mjs'
export default async function (win, out) {
  const ids = await seed(win)
  const pdf = '/tmp/unios-Skript-Analysis-Kapitel-1.pdf'
  writeFileSync(pdf, makePdfBytes('Kapitel 1: Folgen und Reihen. Konvergenzkriterien nach Cauchy.'))
  await win.evaluate(async ({ ids, pdf }) => {
    const r = await window.bridge.invoke('files.import', { courseId: ids.ana, paths: [pdf] })
    if (!r.ok) throw new Error(r.error.message)
  }, { ids, pdf })
  await win.reload()
  await win.getByText('Analysis I').first().click()
  await win.getByRole('tab', { name: 'Files' }).click()
  await win.waitForTimeout(400)
  await win.getByText('unios-Skript-Analysis-Kapitel-1.pdf').click()
  await win.waitForTimeout(1500)
  await win.screenshot({ path: `${out}-files.png` })
  await win.keyboard.press('Meta+k')
  await win.keyboard.type('cauchy')
  await win.waitForTimeout(500)
  await win.screenshot({ path: `${out}-search.png` })
}
