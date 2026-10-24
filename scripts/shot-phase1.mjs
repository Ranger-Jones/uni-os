export default async function (win, out) {
  await win.screenshot({ path: `${out}-empty.png` })
  await win.getByText('Create your first semester').click()
  await win.getByRole('button', { name: 'Create semester' }).click()
  await win.getByText('Add a course').click()
  await win.getByLabel('Course name').fill('Analysis I')
  await win.getByLabel('Code').fill('MA-101')
  await win.getByLabel('Lecturer').fill('Prof. Dr. Weber')
  await win.getByRole('button', { name: 'Add time' }).click()
  await win.screenshot({ path: `${out}-dialog.png` })
  await win.getByRole('button', { name: 'Create course' }).click()
  await win.waitForTimeout(400)
}
