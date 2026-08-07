# Damophus Agent Bridge

## Scope

Agent Bridge lets an external process paste Markdown through a SiYuan Protyle editor or export a document as SiYuan Kramdown. Paste supports creating, appending to, and replacing documents from one Markdown file or a JSON manifest. A manifest becomes one request and therefore one workspace snapshot. Export is read-only and never creates a snapshot.

The CLI is the only user-facing interface. The plugin worker is required because Protyle exists only inside the running SiYuan frontend.

## Packages

| Module | Responsibility |
| --- | --- |
| `packages/agent-contract` | Zod schemas, protocol version, events, receipts, and stable error codes |
| `packages/cli` | Citty commands, filesystem transport, TTY progress, and NDJSON output |
| `src/lets-agent-bridge` | Heartbeat, inbox consumer, idempotency, snapshot orchestration, and Protyle adapter |

Neither the CLI nor Agent Bridge imports the question-bank core. The CLI does not import Svelte or XR packages. Clack is confined to the TTY reporter; machine-readable mode never initializes it.

## Command Surface

```text
damophus doctor [--endpoint <url>] [--json]
damophus status <request-id> [--endpoint <url>] [--json]
damophus export --document <id> [--output <file>]
                [--ial none|portable|all]
                [--include-ial <patterns>] [--exclude-ial <patterns>]
damophus export --notebook <id> --path <human-path> [same options]
damophus paste <file> --mode create --notebook <id> --path <human-path>
               [--title <title>] [--close-active ask|always|never]
               [--endpoint <url>] [--json] [--no-wait]
damophus paste --manifest <manifest.json>
               [--close-active ask|always|never]
               [--endpoint <url>] [--json] [--no-wait]
```

Defaults:

- Endpoint: `DAMOPHUS_SIYUAN_URL`, then `http://127.0.0.1:6806`.
- `--close-active=ask` in an interactive terminal.
- `--close-active=never` outside an interactive terminal.
- Commands wait for a final receipt unless `--no-wait` is supplied.
- A manifest has `{ "version": 1, "items": [...] }`; each item contains a Markdown `file`, `mode`, and the same target fields as the single-file command. Paths are resolved relative to the manifest file.
- Export writes Markdown to stdout unless `--output` is supplied. Progress never shares stdout with raw Markdown.
- Export defaults to `--ial portable`, which keeps content, inline styling, custom metadata, table-cell `rowspan`/`colspan`, `fn__none`, and table `colgroup`, while removing `id`, `update`, `updated`, and attribute-view binding properties.
- `--ial none` removes IAL unless forced by `--include-ial`; `--ial all` keeps every property unless removed by `--exclude-ial`. Include and exclude accept comma-separated names or `*` patterns, and an explicit exclude wins.

`--json` writes newline-delimited JSON events to stdout. Diagnostics go to stderr. Interactive prompts and terminal control sequences are forbidden in JSON mode.

## Installation

Install the CLI separately from the SiYuan Bazaar plugin:

```powershell
npm install --global @hibernalglow/damophus-cli
damophus doctor
```

Installing or updating the SiYuan plugin does not modify the operating-system `PATH`. Publishing the CLI as an npm package keeps system installation, upgrades, and command discovery under npm's normal rules. The plugin and CLI must share a compatible protocol version; `damophus doctor` reports the active heartbeat and supported modes.

## Transport Layout

The CLI calls `/api/system/getWorkspaceInfo` to discover the active workspace, then uses:

```text
<workspace>/data/storage/petal/siyuan-damophus/agent-bridge/
  heartbeat.json
  inbox/<request-id>.json
  tasks/<request-id>/events.ndjson
  tasks/<request-id>/approval.json
  tasks/<request-id>/result.json
  completed/<request-id>.json
```

CLI request publication is atomic: write a sibling temporary file, flush it, then rename it into `inbox`. The plugin ignores temporary files. Result files are terminal and immutable. A completed request ID is never executed again.

The heartbeat contains the protocol version, plugin version, workspace identifier, frontend kind, process timestamp, and supported operations. The plugin refreshes it every two seconds; the CLI treats a heartbeat older than thirty seconds as unavailable and does not leave work queued for a future SiYuan startup.

## Paste Transaction

For a mutating invocation the plugin performs:

1. Validate the complete request before any write.
2. Resolve every target and reject ambiguous or existing targets.
3. Resolve every target and detect open target tabs.
4. Obtain authorization to close active target tabs when required.
5. Close target tabs and wait for editor persistence.
6. Create one SiYuan workspace snapshot with a request memo.
7. Execute items serially through the Protyle paste adapter.
8. Read back the resulting document and verify structural signals.
9. Write a receipt containing the snapshot reference and per-item results.

Snapshot failure means zero document writes. Failure after the snapshot stops the batch. The receipt points to the snapshot but Damophus never performs workspace-wide checkout automatically.

## Paste Semantics

`create` requires a notebook ID and a human path. It fails with `TARGET_EXISTS` when that path already resolves.

`append` targets the end of a document. A document block ID is preferred; a human path is accepted only when it resolves uniquely.

`replace` preserves the document root ID, path, title unless explicitly supplied, and document attributes. Only its body is replaced by selecting the existing body in Protyle and dispatching one paste event.

When a target document is already open, `close-active=never` fails with `ACTIVE_TARGET`; `always` closes it automatically; `ask` emits an approval event and the interactive CLI writes the decision to `tasks/<request-id>/approval.json`.

Input is pasted exactly. Damophus does not remove a leading heading, normalize whitespace, repair tables, or rewrite IAL. Remote URLs and existing `assets/...` references pass through. Relative local assets fail with `UNSUPPORTED_LOCAL_ASSET` before the snapshot.

## Kramdown Export

Export accepts a document block ID or a unique notebook ID and human path. The plugin reads SiYuan's own Kramdown representation, then applies the requested IAL range without rewriting visible Markdown. The same shared exporter powers the in-app clipboard action documented in [Kramdown Export](kramdown-export.md).

Native SiYuan tables remain pipe-based Markdown tables. Cell merge metadata such as `rowspan`, `colspan`, and `fn__none` stays attached as IAL. Damophus refuses a document containing an HTML `<table>` instead of silently returning a different table format. Attribute-view placeholders are not converted into ordinary tables because they do not contain a portable Markdown representation of the database rows.

## Stable Errors

| Code | Meaning |
| --- | --- |
| `PLUGIN_UNAVAILABLE` | No fresh compatible heartbeat exists |
| `PROTOCOL_MISMATCH` | CLI and plugin do not share a protocol version |
| `INVALID_REQUEST` | Runtime validation failed |
| `TARGET_EXISTS` | Create target already exists |
| `TARGET_NOT_FOUND` | Append or replace target cannot be resolved |
| `TARGET_AMBIGUOUS` | A human path resolves to multiple documents |
| `ACTIVE_TARGET` | Closing an active target was not authorized |
| `UNSUPPORTED_LOCAL_ASSET` | Markdown contains a relative local asset |
| `SNAPSHOT_FAILED` | The single pre-write workspace snapshot failed |
| `PASTE_FAILED` | Protyle rejected or failed to persist the paste |
| `VERIFY_FAILED` | Read-back verification did not observe the expected structure |
| `EXPORT_FAILED` | Kramdown was empty or could not satisfy the Markdown-table contract |
| `INTERNAL_ERROR` | An unexpected implementation failure occurred |

## Compatibility Rule

The adapter may depend on public plugin exports such as `openTab` and `getAllEditor`, plus documented DOM attributes required to target an editable block. It must not import files from SiYuan's application source tree at runtime. The pinned SiYuan source under `ref/siyuan` is evidence for tests and compatibility decisions only.
