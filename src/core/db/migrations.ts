// Ordered SQL migrations, applied by index via PRAGMA user_version.
// Never edit a released migration — append a new one.
export const migrations: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE semesters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    ects REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT 'blue',
    icon TEXT,
    lecturer TEXT,
    location TEXT,
    grading_mode TEXT NOT NULL DEFAULT 'graded' CHECK (grading_mode IN ('graded','pass_fail')),
    target_grade REAL,
    archived INTEGER NOT NULL DEFAULT 0,
    overview TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX courses_semester ON courses(semester_id);

  CREATE TABLE course_sessions (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX sessions_course ON course_sessions(course_id);

  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    all_day INTEGER NOT NULL DEFAULT 0,
    location TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX events_start ON events(starts_at);

  CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    icon TEXT,
    content TEXT NOT NULL DEFAULT '[]',
    content_text TEXT NOT NULL DEFAULT '',
    sort_order REAL NOT NULL DEFAULT 0,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX pages_course ON pages(course_id);
  CREATE INDEX pages_parent ON pages(parent_id);

  CREATE TABLE grade_components (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    weight REAL NOT NULL,
    grade REAL,
    passed INTEGER,
    date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX grades_course ON grade_components(course_id);

  CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_at TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    grade_component_id TEXT REFERENCES grade_components(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX assignments_course ON assignments(course_id);
  CREATE INDEX assignments_due ON assignments(due_at);

  CREATE TABLE files (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    text TEXT,
    page_count INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX files_course ON files(course_id);

  CREATE TABLE decks (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    source_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
    due TEXT NOT NULL,
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    elapsed_days REAL NOT NULL DEFAULT 0,
    scheduled_days REAL NOT NULL DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    state INTEGER NOT NULL DEFAULT 0,
    last_review TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX cards_deck_due ON cards(deck_id, due);

  CREATE TABLE chat_threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX chat_messages_thread ON chat_messages(thread_id, created_at);

  CREATE VIRTUAL TABLE search_fts USING fts5(
    entity_type UNINDEXED,
    entity_id UNINDEXED,
    course_id UNINDEXED,
    title,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
  );

  -- Keep the search index free of rows whose course disappeared.
  CREATE TRIGGER courses_delete_search AFTER DELETE ON courses BEGIN
    DELETE FROM search_fts WHERE course_id = old.id;
  END;
  CREATE TRIGGER pages_delete_search AFTER DELETE ON pages BEGIN
    DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id = old.id;
  END;
  CREATE TRIGGER files_delete_search AFTER DELETE ON files BEGIN
    DELETE FROM search_fts WHERE entity_type = 'file' AND entity_id = old.id;
  END;
  CREATE TRIGGER assignments_delete_search AFTER DELETE ON assignments BEGIN
    DELETE FROM search_fts WHERE entity_type = 'assignment' AND entity_id = old.id;
  END;
  `
]
