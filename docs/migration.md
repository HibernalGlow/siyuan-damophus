# Migration Guide

## From siyuan-hqweay-go

Damophus uses the plugin ID `siyuan-damophus`, so SiYuan installs it as a separate plugin. Existing `siyuan-hqweay-go` settings are not migrated automatically.

The retained tools are Dashboard, block attributes, link/reference conversion, and typography. EPUB, OCR, VoiceNotes, journal, random question image, synchronization, and other unlisted modules are no longer included. Keep the old plugin installed until any settings you still need have been recorded.

## Initialize The Question Bank

Upgrading does not scan or modify documents automatically. Open Damophus, preview initialization, confirm the system document, then scan each intended question-bank document manually. Resolve all reported conflicts before confirming an index sync.

New Damophus system documents store a recoverable binding manifest on the document itself. If plugin settings are lost later, use the reconnection flow rather than creating a second system document.

Existing question content must follow [Question Bank Contract](question-bank-contract.md). A permanent `custom-qb-id` is required for indexed questions. SiYuan block IDs, visible question numbers, and database row IDs are not substitutes.

Safe structural inferences are listed during scan and persisted only after confirmation. Existing explicit metadata is authoritative: invalid values stop that question from being indexed instead of being silently replaced.

## Existing Flashcards

Damophus uses SiYuan's built-in quick-card deck and does not import legacy custom deck classification. Existing quick cards remain owned by SiYuan and are recognized when their block IDs match indexed question title blocks.

## Recovery Archives

Attempt archives use schema version 1. Import is additive and deduplicates by `attempt_id`. Importing the same archive more than once does not duplicate existing events. Events whose `question_id` is not currently indexed are imported and listed as orphans.

Question navigation relations are workspace-local. During import, Damophus replaces archived relations with the current indexed question block ID and clears the relation for orphan events.

Before changing workspaces or rebuilding the Damophus system document, export attempt history and retain the JSON archive with the normal SiYuan backup.
