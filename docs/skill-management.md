# Skill Management

Damophus manages the same native SiYuan skills that the agent uses. They live at:

```text
<workspace>/data/storage/ai/agent/skills/<skill-name>/
```

The Skill Manager dock can list, read, edit, rename, remove, and import a skill from a real local directory. It calls SiYuan's own skill APIs, so changes appear immediately in SiYuan's agent skill list.

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

Use `--materialize` when the source directory, or files inside it, are symbolic links. The option recursively resolves links and writes only real directories and files into SiYuan's skill directory. This is the recommended mode for the linked skills under `C:\Users\30902\.codex\skills`.

Without `--materialize`, the command preserves symbolic links. This may be useful for an ordinary local directory, but SiYuan sync and the current desktop file-copy API do not reliably retain directory links. The Skill Manager dock therefore imports only real source directories and reports a link source as an error; run the CLI command with `--materialize` for that case.

The CLI and dock both use the same target directory. The dock manages installed skills directly, while the CLI is the supported path for resolving external symbolic links.
