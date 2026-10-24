import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { seed } from './seed-demo.mjs'
export default async function (win, out) {
  const ids = await seed(win)
  const dataDir = join(process.env.SHOT_DIR, 'data')
  const rows = [
    ['VL01_Einfuehrung.pdf', '["lecture"]'],
    ['VL02_Kameramodelle.pdf', '["lecture"]'],
    ['Uebungsblatt_1.pdf', '["exercise"]'],
    ['Blatt1_Loesung.pdf', '["exercise","solution"]'],
    ['Altklausur_WS2324.pdf', '["exam"]'],
    ['Hartley_Zisserman.pdf', '[]']
  ]
  mkdirSync(join(dataDir, 'files', ids.ana), { recursive: true })
  const t = new Date().toISOString()
  const sql = rows
    .map(([name, tags], i) => {
      writeFileSync(join(dataDir, 'files', ids.ana, `f${i}-${name}`), 'x')
      return `INSERT INTO files (id,course_id,name,stored_path,mime,size,text,page_count,tags,created_at,updated_at) VALUES ('f${i}','${ids.ana}','${name}','${ids.ana}/f${i}-${name}','application/pdf',${120000 + i * 3000},'text',3,'${tags}','${t}','${t}');`
    })
    .join('\n')
  execFileSync('sqlite3', [join(dataDir, 'unios.db')], { input: sql })
  await win.reload()
  await win.getByText('Analysis I').first().click()
  await win.getByRole('tab', { name: 'Files' }).click()
  await win.waitForTimeout(500)
  await win.screenshot({ path: `${out}-files.png` })
  await win.getByRole('button', { name: 'Edit tags' }).last().click()
  await win.waitForTimeout(300)
  await win.screenshot({ path: `${out}-popover.png` })
  await win.locator('[data-radix-popper-content-wrapper] button', { hasText: 'Literature' }).click()
  await win.keyboard.press('Escape')
  await win.waitForTimeout(300)
  await win.locator('main span', { hasText: /^Exercise/ }).first().click()
  await win.waitForTimeout(300)
  await win.screenshot({ path: `${out}-filtered.png` })
  console.log('VISIBLE', await win.locator('main li').count())
}
