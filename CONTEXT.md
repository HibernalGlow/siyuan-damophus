# Question Progress Terms

These terms extend the Damophus glossary for per-question progress shown from topic blocks and projected into SiYuan.

## Language

**Question progress**:
The read-only, event-derived status and history of one question: attempted state, attempt counts, objective results, accuracy, latest rating, latest answer time, and review state.
_Avoid_: completion record, hand-maintained score

**Attempted**:
A question has at least one immutable answer event.
_Avoid_: completed, mastered

**Needs review**:
A question whose consecutive `again`/`hard` count reaches the configured review threshold.
_Avoid_: unfinished, incorrect

**Virtual topic progress panel**:
The non-persistent panel rendered beside a loaded topic-anchor block. It lists related questions and their current question progress without changing source blocks.
_Avoid_: embedded table, query block

**Question Index projection**:
An optional, one-way SiYuan attribute-view projection with one row per indexed question and Damophus-managed question-progress columns. TinyBase remains the source of truth.
_Avoid_: progress database, attempt database

**Topic snapshot**:
An explicit, low-frequency, Damophus-managed table or block materialized below a topic block. It is a refreshable derived view and never becomes question-bank storage.
_Avoid_: live source, synchronized copy
