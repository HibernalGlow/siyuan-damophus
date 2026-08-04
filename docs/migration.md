# Migration Guide

## From siyuan-hqweay-go

Damophus uses the plugin ID `siyuan-damophus`, so SiYuan installs it as a separate plugin. Existing `siyuan-hqweay-go` settings are not migrated automatically.

The retained tools are Dashboard, block attributes, link/reference conversion, and typography. EPUB, OCR, VoiceNotes, journal, random question image, synchronization, and other unlisted modules are no longer included. Keep the old plugin installed until any settings you still need have been recorded.

## Initialize The Question Bank

Upgrading does not scan or modify documents automatically. Open Damophus, preview initialization, confirm the system document, then scan each intended question-bank document manually. Resolve all reported conflicts before confirming an index sync.

Existing question content must follow [Question Bank Contract](question-bank-contract.md). A permanent `custom-qb-id` is required for indexed questions. SiYuan block IDs, visible question numbers, and database row IDs are not substitutes.

## Existing Flashcards

Damophus uses SiYuan's built-in quick-card deck and does not import legacy custom deck classification. Existing quick cards remain owned by SiYuan and are recognized when their block IDs match indexed question title blocks.

## Recovery Archives

Attempt archives use schema version 1. Import is additive and deduplicates by `attempt_id`. Importing the same archive more than once does not duplicate existing events. Events whose `question_id` is not currently indexed are imported and listed as orphans.

Before changing workspaces or rebuilding the Damophus system document, export attempt history and retain the JSON archive with the normal SiYuan backup.
