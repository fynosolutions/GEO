# Issue #18 — consecutive acceptance verified

Prepared on 2026-11-18 (Asia/Taipei). Six stores were each collected three consecutive times before moving to the next store, in one uninterrupted process with no checkpoint reuse. Actual attempt order and per-store source timestamps are verified in samples/step1-listing/stability/acceptance.json. Eighteen files are complete; six final files exactly match run-3.

All three rounds classify 27 non-booking records as present, 16 not_collected and 5 unsure. No unsupported confirmed_absent assertion was made. Ratings are positive numbers or null; historical booking facts and timestamps remain intact, with KPOT's unrated zero normalized to null.

Four differences are source-backed: Easy Joy Uber Eats rating 4.5 to 4.8 and review count 24 to 550, with the same store UUID/canonical URL; LaoJie Uber Eats tracking parameter changes in both adjacent comparisons. The provider aggregate changes do not establish real review growth. See comparison.json and 验收报告.md for every item.

Three Facebook failure series each have the initial attempt plus five retries. All cumulative task-related remote states and fees were reconciled, including diagnostics and interrupted captures, within the authorized US$10 ceiling. Exact bills and account/Actor metadata remain local. The earlier interrupted capture is not part of final acceptance.

Validation: check, build, offline listing verifier and 187 tests pass. Coworker main #16 classification files are retained. Ordinary UI and weekly-history schemas remain separate from this issue-specific export. #5/#10 weekly schedule acceptance is not closed by this task.
