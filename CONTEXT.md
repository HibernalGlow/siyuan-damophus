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

# Flashcard Terms

**Flashcard container**:
An explicit root block whose subtree defines one DAMO card. Supported renderer
families are `mark`, `list`, `heading`, `superBlock`, `blockquote`, and
`callout`; a tag or line-level IAL alone is not a container.

**Card identity**:
The portable business identity in `custom-dm-card-id`. It is independent of a
SiYuan block ID, database row ID, and Riff card ID.

**Card kind**:
The semantic memory model, such as `basic` or `cloze`. It is separate from the
renderer used by the current host.

**Card renderer**:
The host presentation declaration in `custom-dm-card-renderer`. DAMO reads it
before native card rendering to select a temporary compatible configuration.

**Riff adapter**:
The SiYuan boundary that detects capabilities, registers cards, verifies them
with a query API, reads due state, and submits ratings. It owns runtime history,
not Markdown identity.

**Source identity**:
The portable `custom-dm-source-key` used to match one live source during import
and rebind. Multiple matches are a conflict; a deleted root is an orphan.

**Topic provider**:
A note anchor carrying `custom-qb-note-topic-id`. Damophus resolves its current
SiYuan block dynamically; the topic ID survives block moves and reconstruction.

**Runtime state**:
Riff-owned due, interval, rating history, suspend/bury and scheduling data. It
must not be written into external Markdown.

**Compatibility layer**:
A capability-detected, reversible adapter around the native `flashcard` config
and card loading boundary. It preserves the user's global settings and restores
the original descriptor on unload.

**Legacy card**:
An existing Riff card, especially an old mark card, whose root and review history
must be preserved unless the user explicitly confirms a migration.
