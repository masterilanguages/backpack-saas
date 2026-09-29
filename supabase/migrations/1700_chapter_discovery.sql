-- PATH chapter · steps 2 "Sentence-by-Sentence Discovery" and 3 "Comprehension Pass".
--
-- recommended_words      : the most useful vocabulary of the chapter, picked
--                          once by AI (frequent, important for understanding,
--                          suited to the level) and highlighted in the
--                          sentences. Stored per student on their own progress
--                          row (media_library is admin-write only).
--                          Shape: [ { "hebrew", "phonetic", "meaning" } ]
-- discovery_completed_at : when the student finished step 2's last sentence.
-- comprehension_completed_at : when the student finished step 3 (Comprehension
--                          Pass). Step 4's answer goes in final_score (1600).

begin;

alter table public.chapter_progress
  add column if not exists recommended_words      jsonb,
  add column if not exists discovery_completed_at timestamptz,
  add column if not exists comprehension_completed_at timestamptz;

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove):
-- ----------------------------------------------------------------------------
-- begin;
-- alter table public.chapter_progress
--   drop column if exists recommended_words,
--   drop column if exists discovery_completed_at,
--   drop column if exists comprehension_completed_at;
-- commit;
