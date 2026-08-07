# ADR 0007: Agent Bridge Reuses Protyle Paste

## Status

Accepted on 2026-08-07.

## Context

Kernel Markdown import does not preserve every SiYuan editing behavior required by Damophus. In particular, complex native tables, table-cell IAL, inline colors, and other editor-specific normalization can differ from a manual paste into Protyle.

External Agents need an unattended command-line interface, but a standalone Node.js process cannot execute Protyle's browser-side paste pipeline. Installing the SiYuan plugin also cannot install a system command or modify `PATH` safely.

## Decision

Damophus provides two cooperating modules:

- `@hibernalglow/damophus-cli` is installed separately through npm and exposes the `damophus` command.
- `lets-agent-bridge` runs inside the Damophus SiYuan plugin and performs host operations.
- `packages/agent-contract` owns the versioned runtime-validated protocol shared by both modules.

The CLI and plugin communicate through durable files under the current workspace's Damophus plugin-data directory. The CLI discovers the active workspace through SiYuan's existing local kernel endpoint. Damophus does not open another localhost port.

Markdown content enters SiYuan by dispatching a paste event to a real Protyle editor. Damophus does not copy or reimplement SiYuan's private Markdown-to-block conversion code. A narrow compatibility adapter owns editor discovery, cursor placement, event dispatch, persistence waiting, and verification.

Each mutating CLI invocation creates one workspace snapshot before its first write. A JSON manifest carries multiple items in one invocation, so the batch still receives one snapshot. Snapshot failure prevents all writes. Batch items run serially and stop after the first failure. Active target tabs require `never`, `always`, or an interactive approval before the snapshot. Damophus never checks out a snapshot automatically.

## Consequences

- Paste behavior tracks the installed SiYuan frontend, including native tables, IAL handling, and inline styles.
- SiYuan must be running with Damophus enabled for writes to execute.
- The compatibility adapter requires focused browser tests against supported SiYuan versions.
- Multiple plugin windows coordinate request execution with the browser Web Locks API; mobile instances without a workspace path do not become the bridge worker.
- The CLI remains independently installable and does not depend on XR, OpenTUI, Svelte, or the question-bank core.
- File protocol compatibility is explicit and can evolve without coupling CLI releases to internal plugin classes.

## Rejected Alternatives

- Kernel Markdown import: it does not match manual paste for the required documents.
- HTML-table import: it can preserve layout but produces HTML blocks instead of native editable tables.
- Operating-system clipboard automation: it is focus-sensitive, platform-specific, and unsuitable for unattended Agents.
- A custom HTTP server: it adds another port, authentication surface, and lifecycle to the plugin.
- Reimplementing Protyle paste: it would duplicate a large private implementation and drift from SiYuan updates.
