// Screenshots of quizzes / test exams and the collapsible sidebar (fake LLM, copy of a database).
// Usage: pnpm build && node scripts/shot-tests.mjs <path/to/unios.db> <courseId> <outDir>
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const [src, courseId, out = '/tmp/unios-shots'] = process.argv.slice(2)
const dir = mkdtempSync(join(tmpdir(), 'unios-tests-'))
mkdirSync(join(dir, 'd'), { recursive: true })
mkdirSync(join(dir, 'u'), { recursive: true })
execFileSync('sqlite3', [src, `.backup '${join(dir, 'd', 'unios.db')}'`])
writeFileSync(join(dir, 'u', 'settings.json'), JSON.stringify({ dataDir: join(dir, 'd') }))
mkdirSync(out, { recursive: true })

const app = await electron.launch({ args: ['.'], env: { ...process.env, UNIOS_USER_DATA: join(dir, 'u'), UNIOS_FAKE_LLM: '1' } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(e.message))
await win.setViewportSize({ width: 1360, height: 900 })
const shot = async (name) => {
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(out, `${name}.png`) })
  console.log('shot', name)
}
const go = (hash) => win.evaluate((h) => (location.hash = h), hash)

await go(`#/courses/${courseId}?tab=tests`)
await win.waitForTimeout(1200)
await shot('01-empty')

// generate a quiz
await win.getByRole('button', { name: 'Generate with AI' }).click()
await win.getByText('Select all').click()
await shot('02-generate-setup')
await win.getByRole('button', { name: /^Generate \d+ questions/ }).click()
await win.getByText('Konvergenz-Quiz').or(win.locator('input[value="Konvergenz-Quiz"]')).first().waitFor()
await shot('03-generate-review')
await win.getByRole('button', { name: /Save quiz with/ }).click()
await win.getByRole('button', { name: 'Start quiz' }).waitFor()
await shot('04-detail')

// take the quiz
await win.getByRole('button', { name: 'Start quiz' }).click()
await win.getByRole('button', { name: /a_n = 1\/n|1\/n/ }).first().click().catch(async () => win.locator('main button:has(.katex)').nth(1).click())
await win.getByRole('button', { name: 'Check' }).click()
await shot('05-quiz-feedback')
await win.getByRole('button', { name: 'Next question' }).click()
await win.locator('main section button').first().click() // multiple: pick first only (partial)
await win.getByRole('button', { name: 'Check' }).click()
await win.getByRole('button', { name: 'Next question' }).click()
await win.getByRole('button', { name: 'True', exact: true }).click()
await win.getByRole('button', { name: 'Check' }).click()
await win.getByRole('button', { name: 'Next question' }).click()
await win.getByPlaceholder(/Your result/).fill('2,0')
await win.getByRole('button', { name: 'Check' }).click()
await win.getByRole('button', { name: 'Next question' }).click()
await win.getByPlaceholder(/Your answer/).fill('Die Glieder kommen sich beliebig nahe.')
await win.getByRole('button', { name: 'Check' }).click()
await win.getByText('Partly correct').waitFor()
await shot('06-quiz-text-graded')
await win.getByRole('button', { name: 'Finish quiz' }).click()
await win.getByText(/Retry \d+ mistake/).first().waitFor()
await shot('07-quiz-result')
await win.getByRole('button', { name: /Retry \d+ mistake/ }).first().click()
await shot('08-retry-run')
await win.getByRole('button', { name: 'Cancel' }).click()

// an exam with a time limit, graded at the end
await go(`#/courses/${courseId}?tab=tests`)
await win.waitForTimeout(600)
await win.getByRole('button', { name: 'Generate with AI' }).click()
await win.getByText('Test exam', { exact: true }).click()
await win.getByText('Select all').click()
await win.getByPlaceholder('e.g. 90').fill('45')
await win.getByRole('button', { name: /^Generate \d+ questions/ }).click()
await win.getByRole('button', { name: /Save exam with/ }).click()
await win.getByRole('button', { name: 'Start exam' }).click()
await win.getByRole('button', { name: 'False', exact: true }).click()
await win.getByPlaceholder(/Your result/).fill('3')
await shot('09-exam-run')
await win.getByRole('button', { name: 'Submit', exact: true }).click()
await win.getByRole('button', { name: 'Submit', exact: true }).last().click() // confirm unanswered
await win.getByText(/grade estimate/).waitFor({ timeout: 15000 })
await shot('10-exam-result')
await win.getByRole('button', { name: /Konvergenz-Quiz|Mock exam/ }).first().click()

// paper result + manual exam
await win.getByText('Record a paper result').first().click()
await win.getByLabel('Points').fill('31')
await win.getByLabel('Out of').fill('40')
await win.getByRole('button', { name: 'Save result' }).click()
await shot('11-exam-detail-results')
await go(`#/courses/${courseId}?tab=tests`)
await win.waitForTimeout(600)
await win.getByRole('button', { name: 'Add test exam' }).click()
await win.getByPlaceholder('e.g. Exam WS 2024/25').fill('Altklausur WS 2024/25')
await win.locator('[role=dialog] input[type=checkbox]').first().check().catch(() => {})
await shot('12-add-old-exam')
await win.getByRole('button', { name: 'Add', exact: true }).click()
await win.waitForTimeout(600)
await go(`#/courses/${courseId}?tab=tests`)
await shot('13-list')

// collapsible sidebar
const page = await win.evaluate(() => [...document.querySelectorAll('nav a[href*="/pages/"]')].map((a) => a.getAttribute('href'))[0])
if (page) await go(page.replace(/^.*#/, '#'))
await win.waitForTimeout(800)
await shot('14-page-sidebar')
await win.keyboard.press('Meta+\\')
await shot('15-page-collapsed')
await win.getByRole('button', { name: 'Show sidebar' }).click()
await shot('16-page-restored')

console.log('page errors', JSON.stringify(errors))
await app.close()
