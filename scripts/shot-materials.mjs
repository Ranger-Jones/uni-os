import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { seed } from './seed-demo.mjs'
export default async function (win, out) {
  const ids = await seed(win)
  // a real video file in the course (same layout importFiles produces)
  const dataDir = join(process.env.SHOT_DIR, 'data')
  mkdirSync(join(dataDir, 'files', ids.ana), { recursive: true })
  const rel = `${ids.ana}/v1-VL03_Epipolargeometrie.mp4`
  copyFileSync('/tmp/VL03_Epipolargeometrie.mp4', join(dataDir, 'files', rel))
  const t = new Date().toISOString()
  execFileSync('sqlite3', [join(dataDir, 'unios.db')], { input: `INSERT INTO files (id,course_id,name,stored_path,mime,size,tags,created_at,updated_at) VALUES ('v1','${ids.ana}','VL03_Epipolargeometrie.mp4','${rel}','video/mp4',${statSync('/tmp/VL03_Epipolargeometrie.mp4').size},'["lecture"]','${t}','${t}');` })
  await win.reload()
  await win.getByText('Analysis I').first().click()
  await win.getByRole('tab', { name: 'Materials' }).click()
  // add a link through the dialog
  await win.getByRole('button', { name: 'Add link' }).click()
  await win.getByLabel('URL').fill('youtube.com/watch?v=Ql3m0tQf4yc')
  await win.getByLabel('Name').fill('Epipolar Geometry — Cyrill Stachniss')
  await win.screenshot({ path: `${out}-dialog.png` })
  await win.getByRole('button', { name: 'Add link', exact: true }).last().click()
  await win.getByRole('button', { name: 'Add link' }).first().click()
  await win.getByLabel('URL').fill('https://moodle.uni-weimar.de/course/view.php?id=4711')
  await win.getByLabel('Name').fill('Moodle course page')
  await win.getByRole('button', { name: 'Add link', exact: true }).last().click()
  await win.waitForTimeout(500)
  await win.screenshot({ path: `${out}-list.png` })
  await win.getByRole('button', { name: /^Videos/ }).click()
  await win.waitForTimeout(300)
  console.log('VIDEOS VISIBLE', await win.locator('main li').count())
  await win.getByText('VL03_Epipolargeometrie.mp4').click()
  await win.waitForTimeout(1500)
  const v = win.locator('video')
  await v.evaluate((el) => (el.muted = true))
  await v.evaluate((el) => (el.currentTime = 12))
  await win.waitForTimeout(1200)
  console.log('VIDEO', JSON.stringify(await v.evaluate((el) => ({ duration: Math.round(el.duration), time: Math.round(el.currentTime), error: el.error?.code ?? null, ready: el.readyState }))))
  await win.screenshot({ path: `${out}-video.png` })
  await win.keyboard.press('Meta+k')
  await win.keyboard.type('stachniss')
  await win.waitForTimeout(500)
  console.log('SEARCH HIT', await win.getByRole('option', { name: /Stachniss/ }).count())
}
