# Damophus User Guide

## Open The Question Bank

Open a SiYuan document, then choose **Question Bank** from the Damophus top-bar menu or run **Open Question Bank** from the command palette. The current document ID is selected automatically when an editor is open.

## First-time Initialization

1. Open a document in the notebook where the Damophus system document should live.
2. Choose **Preview initialization**.
3. Review the planned `/Damophus` system document and confirm creation.

Damophus creates one question index and one attempt log. Their immutable IDs and managed column key IDs are stored in plugin settings. If that binding becomes invalid, Damophus stops writes instead of creating another database.

### Reconnect An Existing System Document

Damophus also records its verified binding on the system document. If plugin settings are reset, enter the existing `/Damophus` document ID under **Existing Damophus system document ID**, preview the reconnection, and confirm it. Damophus verifies the document, both databases, every managed key ID, and the question relation before restoring the setting.

Initialization refuses to create another `/Damophus` document in the same notebook. Reconnect the existing document instead.

## Scan And Synchronize

1. Open the source document and choose **Scan document**.
2. Review question counts, inferred metadata, issues, and blockers.
3. Resolve blockers in the Markdown source.
4. Choose **Confirm index sync**.

Synchronization indexes question title blocks. It does not rewrite stems, options, answers, or explanations. The accepted Markdown and IAL format is defined in [Question Bank Contract](question-bank-contract.md).

## Practice

- Choose the entire document or a detected topic heading.
- Choose sequential or random order.
- Filter by all questions, wrong answers, consecutive review ratings, or Riff due cards.
- Reveal an answer before rating mastery.
- Use **Undo and retry** before rating to discard an accidental answer without creating an attempt.
- Rate the final attempt as Again, Hard, Good, or Easy.

For a question group, the shared material is displayed above each independently answered child question.

Objective correctness and mastery rating are independent. Subjective questions use an optional 0-100 self score and always leave objective correctness empty.

## Riff

Damophus uses SiYuan's built-in quick-card deck. When automatic quick cards are enabled, a question is added when its consecutive Again/Hard count reaches the configured threshold. The **Due** filter reads SiYuan's current schedule, restricts it to the selected Damophus scope, and submits the chosen mastery rating back to Riff.

Damophus renders the question; SiYuan owns scheduling. Damophus does not create or manage legacy custom decks.

## Backup And Recovery

Choose **Export attempts** to download a versioned JSON archive. Export stops if the attempt database contains invalid rows, preventing a silently incomplete backup.

Choose **Import attempts** and select an archive. Damophus shows importable events, duplicate attempt IDs, and orphan question IDs before any write. Confirmation appends new immutable events, skips duplicates, and reports per-event failures. Orphan events are retained so they can reconnect if the matching question source is restored later.

Routine device synchronization and workspace backup remain SiYuan responsibilities.
