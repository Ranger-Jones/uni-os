# Quizzes, test exams and a collapsible sidebar — design

Requested 2026-10-24: "quizzes can be created and test exams added to courses" (both interactive in the app and old
exam PDFs with results), questions created by AI from course content and via MCP; plus a collapsible sidebar so the
content can use more width. Ship as v0.3.0.

## Concept
A new course tab **Tests** with two kinds of entries:

| Kind | Purpose | Taking it |
|---|---|---|
| Quiz | short question set | one question at a time, feedback right after each answer, no time limit |
| Test exam | longer, points-based mock exam | all questions, optional time limit, graded after submitting: points, %, grade estimate (1.0–5.0) |

A test exam can link PDFs from the course materials (old exam + solution) and can exist without interactive questions;
results written on paper are recorded as "paper attempts" (date, points, max points, note).

## Question types
| Type | Answer | Graded by |
|---|---|---|
| single | one option index | auto |
| multiple | set of option indices | auto, partial credit: max(0, hits − false picks) / #correct × points |
| truefalse | boolean | auto |
| number | value ± tolerance (default: relative 1e-6) | auto; accepts "0,5" and "0.5" |
| text | model answer | AI (points 0…max in 0.5 steps + one-paragraph feedback); the user can override |

Every question: prompt (Markdown + $LaTeX$), points (default 1), explanation, optional source page.
Grade estimate: linear German scale, 50 % → 4.0 … ≥ 95 % → 1.0 (steps 5 %), below 50 % → 5.0; labelled "estimate".

## Data (migration 4)
- `tests` (course_id cascade, kind quiz|exam, title, description, time_limit_min, file_ids json)
- `test_questions` (test_id cascade, type, prompt, options json, solution json, points, explanation, source_page_id, sort_order)
- `test_attempts` (test_id cascade, mode interactive|paper, started_at, finished_at, score, max_score, answers json, note)
Tests are indexed in full-text search (title, description, question prompts) and removed with their course.

## Creating tests
- **AI from course content**: dialog → kind, pages and text-bearing files of the course, number of questions,
  allowed types, optional focus; one model call with a `propose_questions` tool → preview with keep/untick → save.
- **MCP / in-app assistant tools**: `list_tests`, `get_test`, `create_test` (with questions), `add_test_questions`,
  `update_test`, `list_test_attempts`, `record_test_result`.
- **Old exam**: "Add test exam" dialog with title, description, time limit and linked material files.

## Taking tests
- Quiz: Check → correct/incorrect, solution and explanation (text answers are graded by AI on Check) → Next → summary.
- Exam: all questions on one page, countdown if a time limit is set (auto-submit at 0), Submit → auto grading,
  then AI grading of text answers → result view with points per question, solutions, feedback, point overrides.
- Every run is stored as an attempt; the test list shows attempts, last and best %; "Retry mistakes" starts a run
  with the questions not fully correct in the last attempt.

## Collapsible sidebar
Toggle button in the sidebar header and ⌘\ / Ctrl+\; when collapsed, a floating button (right of the macOS traffic
lights) brings it back. While collapsed, content columns widen (page editor 3xl → 5xl, course view 5xl → 7xl,
top-level pages 4xl/6xl → 6xl/7xl). The state persists.
