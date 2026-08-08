# Use a reusable virtual topic relation bar

Status: accepted on 2026-08-08.

## Context

Question blocks reference stable topic IDs with `custom-qb-question-topic-ids`.
Ordinary note headings or explicit paragraph anchors provide material for one
topic with `custom-qb-note-topic-id`. Multiple note anchors may provide the
same topic from different books or documents.

Users need to discover these relationships directly in the SiYuan editor
without inserting query-embed blocks, generated links, or other persistent
content. The same capability must work in both directions: a question shows
its topics and note providers, while a topic anchor identifies itself and
shows other providers plus related questions.

## Decision

Damophus renders one reusable **virtual topic relation bar** for every loaded
editor block carrying either direction-specific topic attribute.

### Question block projection

For a block with `custom-qb-question-topic-ids`, the bar shows its topics in
attribute order. Opening a topic reveals two groups:

- `Topic notes`: every block whose `custom-qb-note-topic-id` exactly equals
  that topic ID.
- `Related questions`: every question block whose normalized topic-ID list
  contains that topic ID. The current question is omitted.

### Topic-anchor projection

For a block with `custom-qb-note-topic-id`, the bar first identifies the block
as a topic note. Opening the topic reveals the same two groups:

- `Other topic notes`: all matching note anchors except the current block.
- `Related questions`: all matching question blocks.

The two projections share the same query, sorting, rendering, navigation,
preview, loading, empty, and error states. A topic ID is the relationship key;
SiYuan block IDs are runtime navigation targets only.

## Labels and source ordering

The visible topic label is derived from the highest-priority available note
anchor. If no anchor exists, the stable topic ID remains visible together with
an unresolved state. Damophus does not create a second editable topic name in
question content.

All declared note anchors remain available. Configurable path-keyword rules
only sort providers; they never hide a provider or change its identity. The
default priority is detailed lecture notes, recitation notes, then past-paper
notes, followed by unmatched sources.

## Native SiYuan interaction

Every concrete question or note target is rendered as a non-persisted native
block-reference element with a real `data-id`. SiYuan's document-level hover
dispatcher therefore owns the desktop block preview, configured hover delay,
closing behavior, nested previews, pinning, and theme integration.

The relation bar does not import or call SiYuan's internal popover class. That
class is not part of the public plugin API. Damophus owns only the topic/source
chooser around those native block references. If native hover is unavailable,
navigation remains available and Damophus may mount one read-only public
`Protyle` instance as a fallback; it must release that instance when closed.

Normal click navigation follows SiYuan conventions. Desktop navigation uses
focus and scroll actions with block zoom for large documents. Mobile opens the
same relationship groups in a bottom panel and uses SiYuan's mobile block
navigation.

## Performance and freshness

The bar is initially lightweight and never preloads note bodies. Damophus:

1. Collects stable topic IDs only from currently loaded eligible blocks.
2. Resolves matching anchors and questions in bounded local SQL queries.
3. Caches normalized relation rows in memory.
4. Invalidates affected results after editor mutations, synchronization, or an
   explicit refresh.
5. Keeps at most one plugin-owned chooser or fallback preview open.
6. Disables relation-bar injection inside its own preview surfaces to prevent
   recursive rendering.

SQL reads the current SiYuan workspace only. The feature performs no outbound
network request.

## Content-safety boundary

The virtual relation bar:

- does not call block insert, update, move, or delete APIs;
- does not write attributes while displaying relationships;
- does not create temporary query-embed blocks or hidden system-document
  content;
- is excluded from Markdown export and disappears when its host block leaves
  the editor DOM;
- never replaces an unresolved topic with a fuzzy title match.

The separate explicit `Find or associate note` maintenance flow may write a
confirmed `custom-qb-note-topic-id`. That write is not part of automatic
projection and must show the topic ID, target block, document path, existing
attribute state, and final change before confirmation.

## Consequences

Topic navigation becomes reusable across questions, detailed notes,
recitation notes, and past-paper notes without duplicating persistent links.
Deleting and recreating a block changes only its runtime target; the next
resolution uses the stable topic attribute. The implementation depends on
SiYuan's documented block attributes and locally verified block-reference DOM
contract, while avoiding a hard dependency on an internal popover constructor.
