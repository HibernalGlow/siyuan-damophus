# Damophus Agent Bridge

## Scope

Agent Bridge lets an external process request the same Markdown paste operation that a user performs in a SiYuan Protyle editor. The current vertical slice supports creating, appending to, and replacing one document from one Markdown file. The protocol already reserves batch receipts, approval events, and asynchronous status lookup for subsequent slices.

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
damophus paste <file> --mode create --notebook <id> --path <human-path>
               [--title <title>] [--close-active ask|always|never]
               [--endpoint <url>] [--json] [--no-wait]
```

Defaults:

- Endpoint: `DAMOPHUS_SIYUAN_URL`, then `http://127.0.0.1:6806`.
- `--close-active=ask` in an interactive terminal.
- `--close-active=never` outside an interactive terminal.
- Commands wait for a final receipt unless `--no-wait` is supplied.

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
3. Obtain authorization to close active target tabs when required.
4. Close target tabs and wait for editor persistence.
5. Create one SiYuan workspace snapshot with a request memo.
6. Execute items serially through the Protyle paste adapter.
7. Read back the resulting document and verify structural signals.
8. Write a receipt containing the snapshot reference and per-item results.

Snapshot failure means zero document writes. Failure after the snapshot stops the batch. The receipt points to the snapshot but Damophus never performs workspace-wide checkout automatically.

## Paste Semantics

`create` requires a notebook ID and a human path. It fails with `TARGET_EXISTS` when that path already resolves.

`append` targets the end of a document. A document block ID is preferred; a human path is accepted only when it resolves uniquely.

`replace` preserves the document root ID, path, title unless explicitly supplied, and document attributes. Only its body is replaced by selecting the existing body in Protyle and dispatching one paste event.

Input is pasted exactly. Damophus does not remove a leading heading, normalize whitespace, repair tables, or rewrite IAL. Remote URLs and existing `assets/...` references pass through. Relative local assets fail with `UNSUPPORTED_LOCAL_ASSET` before the snapshot.

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
| `INTERNAL_ERROR` | An unexpected implementation failure occurred |

## Compatibility Rule

The adapter may depend on public plugin exports such as `openTab` and `getAllEditor`, plus documented DOM attributes required to target an editable block. It must not import files from SiYuan's application source tree at runtime. The pinned SiYuan source under `ref/siyuan` is evidence for tests and compatibility decisions only.
