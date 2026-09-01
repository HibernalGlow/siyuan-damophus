# Cover Terms

These terms cover the document title-image (题头图) domain of the more-background module.

**Cover**:
The title/background image of one document, persisted in the root block's `title-img` plus Damophus companion attributes (source URL, cache path, post metadata).
_Avoid_: wallpaper, banner, background image (when referring to the managed title cover)

**Cover position**:
The per-document vertical crop of the cover, a 0-100 percentage. Desktop and mobile keep independent adjustment attributes with different visual meaning per platform; replacing the cover resets it.
_Avoid_: zoom, crop offset

**Cover history**:
The visible, capped list of covers applied to and replaced on documents. Clearing it never erases deduplication memory.
_Avoid_: dedup memory, usage log

**Seen covers**:
The durable, user-invisible record of covers already displayed, used to exclude them from future random picks. It survives history clearing and has a larger cap.
_Avoid_: cover history, blacklist

**Local cover cache**:
Device-local WebP copies of remote covers under the plugin's petal storage, indexed and excluded from SiYuan sync. It is a display optimization, never the authoritative source.
_Avoid_: asset export, cover storage

**Gacha draw**:
Drawing several candidate cards from one template and picking exactly one as the cover. Unpicked cards may be stashed or favorited.
_Avoid_: random apply, batch download

**Stash**:
One-time parking for gacha candidate cards; applying a stashed card consumes it. Fully independent of favorites.
_Avoid_: favorites, history

**Cover favorites**:
Persisted favorite covers with source metadata, reusable across documents without being consumed.
_Avoid_: stash

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

# Database Plus Terms

**Column binding rule**:
An explicit rule that observes one source column in a database row and may produce a value in one target column when its trigger condition is met.
_Avoid_: database automation, formula (unless it is a native SiYuan formula)

**Source column**:
The column whose row value activates a column binding rule.
_Avoid_: trigger field

**Target column**:
The column that receives the value produced by a column binding rule.
_Avoid_: destination field

**Binding generator**:
The named operation that turns a source-column event into a target-column value, such as recording the current time.
_Avoid_: callback, script

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

**Flashcard category**:
An open-ended, content-level Markdown tag in the `闪卡/分类` namespace, such as
`#闪卡/分类/重点#` or `#闪卡/分类/易混淆#`. A card may have multiple categories;
categories are independent of P1-P4 priority and of Riff scheduling state.

**Category policy**:
The user-owned display and review-order settings for categories. Policy does not
change category identity; renaming a category means batch-renaming its Markdown
tag through the SiYuan API.

**Flashcard contribution**:
A removable capability contribution owned by a module. Contributions can add a
stable review-order stage, toolbar action, filter, or batch operation without
owning the host flashcard lifecycle or the existing P1-P4 stage.
