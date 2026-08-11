# Skill Management

Damophus manages the same native SiYuan skills that the agent uses. They live at:

```text
<workspace>/data/storage/ai/agent/skills/<skill-name>/
```

The Skill Manager dock can list, read, edit, rename, remove, detect, and update skills. Long-lived options live in Damophus Settings > Skill manager:

- skill source directory (defaults to the current user's `.skills-manager/skills` directory)
- synchronization backend (ChezMoi by default, with built-in copy as a compatibility option)
- ChezMoi executable name or full path
- detect updates on startup
- synchronize on startup
- synchronize changed skills only, or all readable skills

The dock shows `Not installed`, `Up to date`, `Update available`, `SiYuan only`, and `Unreadable` states. Search, status filters, and name/update-priority sorting are powered by TanStack Table's Svelte adapter. Detection uses a SHA-256 fingerprint of the complete skill directory, including scripts and references, while ignoring manager/VCS metadata. Use **Update all** to update only installed skills whose source fingerprint changed, **Sync all** to synchronize new and changed skills, or the update button beside one skill. The collapsible synchronization log records selection, backend commands, command output, verification, refreshed states, and failures; it can be copied or cleared from the manager. The same manager can be opened in a full SiYuan tab; the dock and tab share one renderer and the same configured source.

Selecting an installed skill opens a read-only preview by default. Damophus passes `SKILL.md` through SiYuan's bundled Lute renderer (`Md2BlockDOM`) and native `ProtyleMethod` renderers, so headings, lists, tables, IAL, tags, math, highlighted code, diagrams, and other SiYuan Markdown constructs use native Block DOM instead of a separate Markdown parser. Switch to **Edit source** only when changing the raw file.

## Synchronization backends

ChezMoi is the default desktop backend. Damophus invokes the configured `chezmoi` command with the configured source directory, the current workspace skill directory, `mode=file`, and explicit destination paths for the selected skills. It applies only readable skills that need an update, runs `chezmoi verify`, and then independently compares the source and installed directory fingerprints. ChezMoi metadata remains outside the SiYuan skill directory, and installed skills are real files rather than directory links.

ChezMoi requires SiYuan Desktop with Node integration and a working ChezMoi executable. The plugin reports an actionable error when the runtime or command is unavailable; it does not silently change synchronization behavior. Select **Built-in copy (compatibility)** on mobile or on a desktop where ChezMoi cannot be installed. The built-in backend retains the existing staged-copy and rollback behavior through SiYuan's file API.

## CLI

```powershell
damophus skill list
damophus skill get legal-marknote --output .\SKILL.md
damophus skill save legal-marknote --file .\SKILL.md
damophus skill rename legal-marknote --new-name legal-notes
damophus skill remove legal-notes
damophus skill sync C:\Users\30902\.codex\skills\legal-marknote --materialize
```

`skill sync` discovers the current workspace through the running SiYuan kernel unless `--workspace` is supplied. It copies through a temporary sibling directory, verifies `SKILL.md`, and replaces an installed skill only after the copy is complete.

Use `--materialize` when the source directory, or files inside it, are symbolic links. The option recursively resolves links and writes only real directories and files into SiYuan's skill directory. This is the recommended mode for linked skills under the current user's `.codex/skills` directory.

Without `--materialize`, the command preserves symbolic links. This may be useful for an ordinary local directory, but SiYuan sync and the current desktop file-copy API do not reliably retain directory links. The plugin defaults to Skills Manager's real storage directory and uses ChezMoi file mode on desktop. Configure another real source directory when needed; run the CLI with `--materialize` when only a linked source is available.

The CLI and dock both use the same target directory. The dock manages installed skills directly, while the CLI is the supported path for resolving external symbolic links.
