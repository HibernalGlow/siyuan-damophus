# Kramdown Export

Damophus can copy SiYuan Kramdown from inside the plugin or return it through the CLI Agent Bridge. Both entry points share the same IAL filtering and Markdown-table validation.

## In SiYuan

Open the Damophus top-bar menu and choose **Copy Markdown with IAL**. The same action is also available from the block menu.

- When blocks are selected, the dialog can copy those blocks in editor order or switch to the whole document.
- When no blocks are selected, the dialog copies the whole document.
- The final Markdown is written to the system clipboard in one operation.
- Nested selected blocks are not duplicated when their selected parent is already exported.

The dialog remembers the last IAL mode and include/exclude patterns. The same defaults are available in the Kramdown Export module settings.

## IAL Ranges

`portable` is the default. It removes `id`, `update`, `updated`, and attribute-view binding properties such as `custom-sy-av-*`. It preserves other block attributes, inline styles, table `colgroup`, and cell merge properties such as `rowspan`, `colspan`, and `fn__none`.

`all` preserves every IAL property. `none` removes IAL unless a property is forced by an include pattern. Include and exclude fields accept comma-separated names or `*` patterns; an explicit exclude takes priority.

## Tables

SiYuan's API returns native tables as rendered HTML. Damophus converts those tables back to pipe-based Markdown, including merged-cell `rowspan`/`colspan` IAL and `fn__none` placeholders. HTML tables inside fenced code remain untouched; any rendered table left unconverted is reported as an export error.

Attribute views remain SiYuan attribute-view placeholders. They are not converted into ordinary Markdown tables because the placeholder does not contain a portable copy of the database rows.

## CLI

```powershell
damophus export --document <block-id>
damophus export --notebook <notebook-id> --path <human-path> --output note.md
damophus export --document <block-id> --ial all
damophus export --document <block-id> --ial none --include-ial "custom-qb-*"
```

Without `--output`, raw Markdown is written to stdout without progress messages. `--json` returns events and the final export receipt as newline-delimited JSON.
