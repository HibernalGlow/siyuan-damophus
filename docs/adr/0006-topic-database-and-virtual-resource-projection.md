# Use a topic database with virtual resource projection

Status: accepted on 2026-08-07.

## Decision

Damophus uses a third managed attribute view as the **Topic Index**. The existing Question Index receives one multi-value relation column named `Topics`, targeting Topic Index. A question may relate to any number of topics; a topic may relate to any number of questions.

The relation column is the only routine maintenance entry point for topic assignment inside SiYuan. Users add or remove topics from the question row. SiYuan maintains the inverse relation and its ordinary relation displays. Damophus does not maintain a second editable list of topic assignments in the question row.

`custom-qb-question-topic-ids` is the portable question-to-topic export/import representation. When emitted, it contains stable Topic Index IDs rather than attribute-view row IDs or SiYuan block IDs. Normal notes use the separate single-value `custom-qb-note-topic-id` provider declaration. The attribute names express direction without a role field.

## Topic Index

Topic Index owns one row per reusable, atomic legal point. Its managed fields are:

| Field | Type | Contract |
| :--- | :--- | :--- |
| `topic_id` | text | Stable lowercase ASCII kebab-case ID; unique and never derived from display order |
| `name` | title/text | Human-facing point name; may be edited without changing `topic_id` |
| `subject` | single select | Primary subject; no restriction is imposed on the number of laws or topics below it |
| `laws` | multi-select | One point may belong to multiple laws |
| `categories` | multi-select | One point may belong to multiple topics/categories |
| `resource` | image/resource | Optional primary animation or image for this point |
| `status` | single select | `active` or `archived` |
| `questions` | inverse relation | Questions currently linked through Question Index |
| `question_count` | rollup | Derived count of linked questions |
| `attempt_count` | derived/rollup | Rebuilt from immutable Attempt Log events |
| `wrong_count` | derived/rollup | Rebuilt from immutable Attempt Log events |
| `wrong_rate` | derived | `wrong_count / attempt_count`, with an explicit zero-attempt state |

`laws` and `categories` are deliberately multi-value. Damophus must not reject a point because it spans multiple statutes, legal systems, chapters, or teaching classifications.

An archived topic remains readable and keeps its historical associations. Hard deletion is allowed only after it has no linked questions, no resource mapping, and no historical usage that the user wants to retain.

## Question Index

Question Index keeps its existing stable identity and attempt relation. Add only the managed `Topics` relation column:

```text
Question Index.Topics -> Topic Index
cardinality: many-to-many
```

Do not add `topic_1`, `topic_2`, `topic_name`, `wrong_count`, or `correct_rate` columns to Question Index. Topic labels and topic-level aggregates belong to Topic Index; question-level attempt facts remain in Attempt Log.

The stable key remains `custom-qb-id`. SiYuan block IDs and database row IDs are navigation/runtime identifiers only. Changing a relation, renaming a topic, moving a question, or recreating a block must not rewrite `custom-qb-id`.

## Statistics

Topic statistics use the current Question Index relation. If a question moves from topic A to topic B, existing attempts are counted under B on the next rebuild; Attempt Log events are not rewritten and do not store a topic snapshot in this version.

This gives the user the expected answer to “which points are currently most often wrong?” while keeping attempts immutable. If historical classification is later required, add a versioned topic snapshot as a new event or derived table; do not mutate the existing events.

Because native rollups may not cover every multi-hop aggregate reliably, the UI may display native relation rollups while Damophus also exposes a deterministic rebuild from `Question Index.Topics` plus Attempt Log. A rebuild must be able to repair derived values without changing question content or attempt events.

## Synchronization modes

The database relation is maintained directly in SiYuan. Import/export tooling may reconcile it with `custom-qb-question-topic-ids` using an explicit mode:

```text
merge: union the two sets; add missing relations and delete nothing
diff: report added/removed/retained IDs, then apply the confirmed target set
```

`diff` is the only mode that removes relations. It must produce a preview containing the question ID, current set, incoming set, additions, removals, and final set before writes. Unknown topic IDs are reported and can be created as placeholders only by an explicit migration action; ordinary scans do not invent topic rows.

## Virtual resource projection

When a question has one or more related topics, Damophus resolves each topic's `resource` field and presents the available animation/image as a **virtual projection**:

1. Read the current question relation.
2. Resolve related Topic Index rows and discard archived rows with no resource.
3. Deduplicate resources by stable resource identity and preserve relation order.
4. Render a non-persisted resource panel in the practice renderer or a plugin-owned preview surface.
5. Remove the projection when the question changes, the panel closes, or the source block leaves the document.

The default projection does not call block insertion APIs, does not alter Markdown, and does not create a SiYuan block. It is therefore safe to show an animation while preserving the original question and all existing references.

An actual SiYuan embed block is a separate, explicit **固化** action. It must require user confirmation, record the source block/resource identity, and be treated as ordinary document content after insertion. The virtual path must never silently upgrade itself into a real block.

For editor-side previews, prefer a plugin-owned side panel, popover, or practice surface. Direct DOM decoration inside the editor is a last-resort visual enhancement only: it must be keyed by the question block ID, use a MutationObserver for cleanup, and never be mistaken for persisted document structure.

## Binding and migration

The Damophus system binding records the immutable Topic Index ID, its managed key IDs, and the Question Index relation-column key ID. Startup performs a read-only binding check. Missing or wrong target databases, relation targets, or managed column types stop writes and produce a repair preview; the plugin never creates a second hidden Topic Index automatically.

Migration order:

1. Preview the existing system binding and Question Index rows.
2. Create or bind Topic Index only after confirmation.
3. Add the `Topics` relation column using its immutable key ID.
4. Resolve existing portable topic IDs into Topic Index rows or report them as unresolved.
5. Write relation values in an idempotent batch.
6. Rebuild topic counts and statistics.
7. Verify that question content, `custom-qb-id`, block references, and Attempt Log events are unchanged.

Every write returns per-question and per-topic results. Failed rows remain retryable; no partial success is presented as a complete migration.

Legacy Markdown may still contain `custom-qb-topic-ids` or `custom-qb-role="topic"` plus `custom-qb-topic-id`. Scans accept those names only as migration inputs and report them. New writes use the direction-specific attributes.
