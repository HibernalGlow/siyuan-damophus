# Use one shared, manually refreshed topic dictionary

Status: accepted on 2026-08-10.

## Context

Stable topic IDs are lowercase ASCII relationship keys. A topic can exist in
question metadata without any matching note anchor, so note titles cannot be
the only source of a readable Chinese label. Topic names are low-frequency,
AI-assisted maintenance data rather than concurrent practice or event data.

## Decision

Damophus stores one workspace-level `topic-dictionary.json` under the plugin
storage root. It is not split by SiYuan device ID. SiYuan synchronizes the
file; Damophus serializes writes and validates the complete document before
using it.

The maintenance view loads the existing dictionary without scanning the
workspace. A scan occurs only after the user selects **Scan updates**, unless
the separate **Scan when this view opens** option is explicitly enabled. That
option defaults to off.

A scan discovers IDs from `custom-qb-question-topic-ids` and
`custom-qb-note-topic-id`. It refreshes subject, category, collection, source,
and note-title candidates. Missing IDs remain in the dictionary with a
`retired` state; scans never delete confirmed names.

An explicit `custom-qb-subject` on a discovered topic block remains
authoritative. When it is absent, Damophus derives the canonical law-exam
subject from the stable topic-ID namespace using a centralized, longest-prefix
registry. Unknown namespaces remain unclassified rather than being guessed
from mutable document paths.

Visible labels resolve in this order:

1. Confirmed dictionary display name.
2. Highest-priority available topic-note title.
3. Stable topic ID.

## Consequences

- A topic can display Chinese without any topic-note anchor.
- AI can maintain one predictable JSON document instead of selecting a device
  contribution store.
- The dictionary UI can group the same data by subject, category, collection,
  or source without changing topic identity or translation.
- Concurrent edits from multiple devices are not semantically merged. The
  feature therefore treats dictionary editing as a serialized single-writer
  workflow and retains invalid files for diagnosis instead of overwriting them.
