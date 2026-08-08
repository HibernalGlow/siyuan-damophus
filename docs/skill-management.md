# Skill Management

Damophus manages the same native SiYuan skills that the agent uses. They live at:

```text
<workspace>/data/storage/ai/agent/skills/<skill-name>/
```

The Skill Manager dock can list, read, edit, rename, remove, detect, and update skills. Long-lived options live in Damophus Settings > Skill manager:

- skill source directory (defaults to the current user's `.skills-manager/skills` directory)
- detect updates on startup
- synchronize on startup
- synchronize changed skills only, or all readable skills

The dock shows `Not installed`, `Up to date`, `Update available`, `SiYuan only`, and `Unreadable` states. Detection uses a SHA-256 fingerprint of the complete skill directory, including scripts and references, while ignoring manager/VCS metadata. Use **Sync all** for a manual batch update or the update button beside one skill. The same manager can be opened in a full SiYuan tab; the dock and tab share one renderer and the same configured source.

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

Without `--materialize`, the command preserves symbolic links. This may be useful for an ordinary local directory, but SiYuan sync and the current desktop file-copy API do not reliably retain directory links. The plugin therefore defaults to Skills Manager's real storage directory instead of its `.codex` link projection. Configure another real source directory when needed; run the CLI with `--materialize` when only a linked source is available.

The CLI and dock both use the same target directory. The dock manages installed skills directly, while the CLI is the supported path for resolving external symbolic links.
