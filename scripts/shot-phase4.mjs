import { seed } from './seed-demo.mjs'
export default async function (win, out) {
  const ids = await seed(win)
  await win.evaluate(async (ids) => {
    const call = async (p, i) => {
      const r = await window.bridge.invoke(p, i)
      if (!r.ok) throw new Error(p + ': ' + r.error.message)
      return r.data
    }
    const old = await call('semesters.create', { name: 'SS 26', startDate: '2026-04-01', endDate: '2026-09-30' })
    const mk = async (name, color, ects, comps, mode = 'graded') => {
      const c = await call('courses.create', { semesterId: old.id, name, color, ects, gradingMode: mode })
      for (const x of comps) await call('grades.createComponent', { courseId: c.id, ...x })
    }
    await mk('Grundlagen der Informatik', 'teal', 8, [{ name: 'Klausur', weight: 100, grade: 1.7 }])
    await mk('Diskrete Strukturen', 'red', 8, [{ name: 'Klausur', weight: 80, grade: 2.3 }, { name: 'Übungen', weight: 20, grade: 1.3 }])
    await mk('Mathe-Vorkurs', 'gray', 2, [{ name: 'Teilnahme', weight: 0, passed: true }], 'pass_fail')
    await call('grades.createComponent', { courseId: ids.ana, name: 'Klausur', weight: 70 })
    await call('grades.createComponent', { courseId: ids.ana, name: 'Zwischentest', weight: 30, grade: 2.0 })
  }, ids)
  await win.reload()
  await win.getByText('Grades', { exact: true }).click()
  await win.waitForTimeout(500)
  await win.getByLabel('Target average').fill('1,8')
  await win.waitForTimeout(200)
  await win.screenshot({ path: `${out}-grades.png` })
  await win.getByText('Analysis I').first().click()
  await win.getByRole('tab', { name: 'Grades' }).click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: `${out}-course.png` })
}
