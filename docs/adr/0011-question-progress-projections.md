# Keep question progress in virtual and one-way projections

Status: accepted on 2026-08-19.

Damophus will expose per-question progress in the existing virtual topic relation panel and add the same derived fields as managed columns to the optional Question Index attribute-view projection. TinyBase immutable attempt events and rebuilt aggregates remain the only business source; neither the virtual panel nor the attribute view may write back to question content, IAL, attempts, or TinyBase.

The virtual panel lists every related question for each loaded topic anchor, including attempted state, attempt count, objective correct/incorrect counts, accuracy, latest rating/time, and the configured needs-review state. A question related to multiple topics appears in each relevant panel but its aggregate is never counted more than once. Stable question and topic IDs, rather than block placement, determine identity.

Projection refresh is explicit or follows a completed catalog refresh according to the existing projection profile. It is never performed after every answer or during SiYuan sync. Refresh previews changes and overwrites only Damophus-managed columns; user columns remain untouched. Topic snapshots are optional, low-frequency, explicitly confirmed materializations under a topic block and are not the default display path.
