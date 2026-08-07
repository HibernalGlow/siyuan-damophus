# Damophus User Guide

> **Runtime note (2026-08-08).** The Question Index, Topic Index, and Attempt Log descriptions below document the legacy AV workflow for migration/reference. After TinyBase cutover, practice, exams, sessions, history, catalogs, and statistics use the local TinyBase warehouse and synchronized device contributions. AV tables are optional one-way browse projections; deleting them does not disable question-bank behavior.

For the current storage model and synchronization behavior, see [ADR 0008](adr/0008-tinybase-synced-data-warehouse.md) and [TinyBase Migration Plan](tinybase-migration-plan.md). New events remain available after source-block deletion and plugin reload because they are stored as immutable TinyBase records.

## Open The Question Bank

Open a SiYuan document, then choose **Question Bank** from the Damophus top-bar menu or run **Open Question Bank** from the command palette. The current document ID is selected automatically when an editor is open.

## First-time Initialization

1. Open a document in the notebook where the Damophus system document should live.
2. Choose **Preview initialization**.
3. Review the planned `/Damophus` system document and confirm creation.

Damophus creates a Question Index, a Topic Index, and an Attempt Log. Their immutable IDs and managed column key IDs are stored in plugin settings. If that binding becomes invalid, Damophus stops writes instead of creating another database.

### Reconnect An Existing System Document

Damophus also records its verified binding on the system document. If plugin settings are reset, enter the existing `/Damophus` document ID under **Existing Damophus system document ID**, preview the reconnection, and confirm it. Damophus verifies the document, all three databases, every managed key ID, and both two-way relations before restoring the setting.

Initialization refuses to create another `/Damophus` document in the same notebook. Reconnect the existing document instead.

## Scan And Synchronize

1. Open the source document and choose **Scan document**.
2. Review question counts, inferred metadata, issues, and blockers.
3. Resolve blockers in the Markdown source.
4. Choose **Confirm index sync**.

Synchronization indexes question title blocks. It does not rewrite stems, options, answers, or explanations. The accepted Markdown and IAL format is defined in [Question Bank Contract](question-bank-contract.md).

Expand **Scan details** to inspect every inference, source issue, conflict, planned IAL update, and managed database-column repair. Confirmation writes only safely inferred `custom-qb-type`, `custom-qb-answer`, and `custom-qb-section` attributes before updating the question index. Invalid explicit metadata is never replaced by an inference, and a stale preview must be scanned again.

If a managed database column was deleted, Damophus previews its restoration using the immutable key ID recorded in the binding. Unknown user columns and their relative order are preserved. Wrong column types, missing primary keys, and relation columns targeting the wrong database remain blockers rather than being changed automatically.

## Topic Index

Question Index contains one multi-value **Topics** relation targeting Topic Index. Add or remove topic relations there during normal SiYuan use. A topic can relate to any number of questions, laws, and categories. Set its status to `archived` instead of deleting a topic that still has relations or history.

Portable question Markdown uses `custom-qb-question-topic-ids="topic-a,topic-b"`. Normal notes use `custom-qb-note-topic-id="topic-a"` on a topic heading or explicit topic anchor. The first attribute references multiple topics; the second provides note material for one topic. A `merge` preview only adds missing relations; a `diff` preview shows additions and removals before replacing the current set. Unknown IDs are reported and never create hidden topic rows. Legacy topic attributes remain readable only to produce a migration warning.

The Topic Index **Resource** column accepts SiYuan assets. During practice, related images, animations, and videos appear in a plugin-owned resource panel. This is a runtime projection: it does not insert a block, change Markdown, or alter references. Persisted embeds require a separate explicit action and are not created by the virtual projection.

Topic attempt count, wrong count, and wrong rate are rebuilt from immutable Attempt Log events using the question's current topic relations. Reclassifying a question therefore moves its historical attempts to the newly related topics without rewriting the events.

## Hide Answers In The Source Document

Open the **Question Bank** settings and enable **Source answer masking**. Damophus then uses the existing `custom-qb-answer` and `custom-qb-section="solution"` attributes to mask answer letters in the original SiYuan editor. It does not change Markdown, IAL, block content, or the separate practice renderer.

Choose **Blur**, **Solid cover**, or **Underline cover** and use the live preview in settings. Hovering or clicking a masked letter reveals it temporarily; disabling the setting removes the injected spans and restores the editor text.

## Practice

- Choose the entire document or a detected topic heading.
- Choose sequential or random order.
- Filter by all questions, wrong answers, consecutive review ratings, or Riff due cards.
- Reveal an answer before rating mastery.
- Use the source icon beside the question title to open its title block in SiYuan's native editor. Edit there normally, then return to Damophus and scan the document again to refresh the question bank.
- Use **Undo and retry** before rating to discard an accidental answer without creating an attempt.
- Rate the final attempt as Again, Hard, Good, or Easy.

The recent scope is stored as the document ID plus the SiYuan heading block ID. Renaming a heading or using repeated heading text does not lose the selection; deleting or moving that heading outside the document clears it safely.

For a question group, the shared material is displayed above each independently answered child question.

Objective correctness and mastery rating are independent. Subjective questions use an optional 0-100 self score and always leave objective correctness empty.

Damophus does not maintain a second copy of the editor. SiYuan handles text editing, undo, block operations, and synchronization on both desktop and mobile.

## Riff

Damophus uses SiYuan's built-in quick-card deck. When automatic quick cards are enabled, a question is added after its configured consecutive rating threshold is reached: Hard defaults to one rating and Again defaults to two ratings. Both thresholds are independently customizable. The **Due** filter reads SiYuan's current schedule, restricts it to the selected Damophus scope, and submits the chosen mastery rating back to Riff.

Damophus renders the question; SiYuan owns scheduling. Damophus does not create or manage legacy custom decks.

## Backup And Recovery

Choose **Export attempts** to download a versioned JSON archive. Export stops if the attempt database contains invalid rows, preventing a silently incomplete backup.

Choose **Import attempts** and select an archive. Damophus shows importable events, duplicate attempt IDs, and orphan question IDs before any write. Confirmation appends new immutable events, skips duplicates, and reports per-event failures. Orphan events are retained so they can reconnect if the matching question source is restored later.

Imported navigation relations are rebuilt from the current question index. Relations from another workspace are never reused; orphan events keep their stable question ID without a stale relation.

Routine device synchronization and workspace backup remain SiYuan responsibilities.
