// Steps for shot.mjs: seed a realistic semester through the UI's own API bridge.
export async function seed(win) {
  return win.evaluate(async () => {
    const call = async (p, i) => {
      const r = await window.bridge.invoke(p, i)
      if (!r.ok) throw new Error(p + ': ' + r.error.message)
      return r.data
    }
    const today = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const d = (offset) => {
      const x = new Date(today)
      x.setDate(x.getDate() + offset)
      return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
    }
    const s = await call('semesters.create', { name: 'WS 26/27', startDate: '2026-10-01', endDate: '2027-03-31' })
    const mk = async (name, color, icon, ects, sessions, extra = {}) => {
      const c = await call('courses.create', { semesterId: s.id, name, color, icon, ects, ...extra })
      await call('sessions.replaceForCourse', { courseId: c.id, rows: sessions })
      return c
    }
    const ana = await mk('Analysis I', 'blue', '📐', 9, [
      { kind: 'lecture', weekday: 1, startTime: '10:00', endTime: '12:00', location: 'Audimax' },
      { kind: 'lecture', weekday: 3, startTime: '10:00', endTime: '12:00', location: 'Audimax' },
      { kind: 'tutorial', weekday: 4, startTime: '14:00', endTime: '16:00', location: 'SR 2' }
    ], { code: 'MA-101', lecturer: 'Prof. Dr. Weber', targetGrade: 1.7 })
    const la = await mk('Lineare Algebra', 'purple', '🧮', 9, [
      { kind: 'lecture', weekday: 2, startTime: '08:00', endTime: '10:00', location: 'H3' },
      { kind: 'tutorial', weekday: 5, startTime: '12:00', endTime: '14:00', location: 'SR 5' }
    ], { code: 'MA-102' })
    const prog = await mk('Programmierung', 'green', '💻', 6, [
      { kind: 'lecture', weekday: 2, startTime: '14:00', endTime: '16:00', location: 'H1' },
      { kind: 'lab', weekday: 4, startTime: '08:00', endTime: '10:00', location: 'Pool' }
    ])
    const eng = await mk('Academic English', 'orange', '🇬🇧', 3, [{ kind: 'seminar', weekday: 3, startTime: '16:00', endTime: '17:30', location: 'R 1.12' }], { gradingMode: 'pass_fail' })
    await call('assignments.create', { courseId: ana.id, title: 'Übungsblatt 3', dueAt: `${d(2)}T12:00`, priority: 'high' })
    await call('assignments.create', { courseId: la.id, title: 'Übungsblatt 2', dueAt: `${d(-1)}T23:59` })
    await call('assignments.create', { courseId: prog.id, title: 'Projekt: Snake in Java', dueAt: d(9), status: 'in_progress' })
    await call('assignments.create', { courseId: eng.id, title: 'Essay draft', dueAt: d(5), priority: 'low' })
    await call('events.create', { courseId: ana.id, title: 'Klausur Analysis I', kind: 'exam', startsAt: `${d(40)}T09:00`, endsAt: `${d(40)}T11:00`, location: 'Audimax' })
    await call('events.create', { courseId: null, title: 'Lerngruppe', kind: 'appointment', startsAt: `${d(0)}T18:00`, endsAt: `${d(0)}T20:00`, location: 'Bibliothek' })
    return { ana: ana.id, la: la.id, prog: prog.id, eng: eng.id }
  })
}
