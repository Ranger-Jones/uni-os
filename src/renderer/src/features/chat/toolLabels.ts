const LABELS: Record<string, string> = {
  list_semesters: 'Looked at semesters',
  list_courses: 'Looked at courses',
  get_course: 'Opened course',
  list_pages: 'Listed notes',
  read_page: 'Read note',
  search: 'Searched',
  list_assignments: 'Checked assignments',
  list_events: 'Checked calendar',
  get_schedule: 'Checked timetable',
  get_grades: 'Checked grades',
  grade_forecast: 'Calculated forecast',
  list_files: 'Listed files',
  read_file_text: 'Read file',
  find_in_files: 'Searched the slides',
  list_decks: 'Looked at flashcards',
  list_cards: 'Read flashcards',
  list_links: 'Listed links',
  list_tests: 'Looked at quizzes and exams',
  get_test: 'Opened quiz',
  list_test_attempts: 'Checked results',
  create_page: 'Create note',
  append_to_page: 'Add to note',
  update_page: 'Rewrite note',
  create_assignment: 'Create assignment',
  update_assignment: 'Update assignment',
  create_event: 'Add calendar event',
  set_component_grade: 'Record grade',
  create_flashcards: 'Create flashcards',
  add_link: 'Add link',
  update_link: 'Update link',
  set_file_tags: 'Tag file',
  create_test: 'Create quiz or exam',
  add_test_questions: 'Add questions',
  update_test: 'Update quiz or exam',
  record_test_result: 'Record result',
  view_pdf_page: 'Looked at PDF page',
  insert_pdf_image: 'Insert figure from PDF'
}

export const toolLabel = (name: string): string => LABELS[name] ?? name.replace(/_/g, ' ')

/** One-line hint of what the tool call is about, from its input. */
export function toolHint(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const i = input as Record<string, unknown>
  const v = i.query ?? i.title ?? i.name ?? (Array.isArray(i.cards) ? `${i.cards.length} cards` : undefined)
  return typeof v === 'string' ? `“${v.length > 48 ? v.slice(0, 48) + '…' : v}”` : ''
}
