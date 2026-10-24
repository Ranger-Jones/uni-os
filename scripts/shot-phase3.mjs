import { seed } from './seed-demo.mjs'
export default async function (win, out) {
  await seed(win)
  await win.reload()
  await win.waitForTimeout(800)
  await win.screenshot({ path: `${out}-today.png` })
  await win.getByText('Calendar', { exact: true }).click()
  await win.waitForTimeout(500)
  await win.screenshot({ path: `${out}-week.png` })
  await win.getByRole('button', { name: 'month' }).click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: `${out}-month.png` })
}
