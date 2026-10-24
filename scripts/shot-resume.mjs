// C1 regression: approval pending in the ⌘J panel, panel closed and full chat opened → approval card still there.
import { seed } from './seed-demo.mjs'
export default async function (win, out) {
  const ids = await seed(win)
  await win.reload()
  await win.keyboard.press('Meta+j')
  await win.getByPlaceholder('Ask about your courses…').fill(`please create sheet 5 for course ${ids.ana}`)
  await win.keyboard.press('Enter')
  await win.getByRole('button', { name: 'Apply' }).waitFor({ timeout: 5000 })
  await win.getByRole('button', { name: 'Open full chat' }).click()
  await win.getByRole('button', { name: 'Apply' }).waitFor({ timeout: 5000 })
  console.log('RESUMED_APPROVAL ok')
  await win.getByRole('button', { name: 'Apply' }).click()
  await win.getByText('This week').waitFor({ timeout: 5000 })
  console.log('RUN_FINISHED ok')
  await win.getByPlaceholder('Ask about your courses…').fill('noch was?')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(1500)
  const bubbles = await win.locator('text=noch was?').count()
  console.log('FOLLOWUP_SENT', bubbles)
}
