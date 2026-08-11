<script lang="ts">
  import {
    columnFilteringFeature,
    createColumnHelper,
    createFilteredRowModel,
    createSortedRowModel,
    createTable,
    filterFn_equalsString,
    filterFn_includesString,
    globalFilteringFeature,
    rowSortingFeature,
    sortFn_text,
    tableFeatures,
    type SortFn,
  } from "@tanstack/svelte-table";
  import DownloadIcon from "lucide-svelte/icons/download";
  import ChevronDownIcon from "lucide-svelte/icons/chevron-down";
  import CopyIcon from "lucide-svelte/icons/copy";
  import ExternalLinkIcon from "lucide-svelte/icons/external-link";
  import PlusIcon from "lucide-svelte/icons/plus";
  import RefreshCwIcon from "lucide-svelte/icons/refresh-cw";
  import SaveIcon from "lucide-svelte/icons/save";
  import SearchIcon from "lucide-svelte/icons/search";
  import ScrollTextIcon from "lucide-svelte/icons/scroll-text";
  import Trash2Icon from "lucide-svelte/icons/trash-2";
  import UploadCloudIcon from "lucide-svelte/icons/cloud-upload";
  import PencilIcon from "lucide-svelte/icons/pencil";
  import { Button } from "@/components/ui/button";
  import * as Collapsible from "@/components/ui/collapsible";
  import { Input } from "@/components/ui/input";
  import * as Select from "@/components/ui/select";
  import * as Tabs from "@/components/ui/tabs";
  import { Textarea } from "@/components/ui/textarea";
  import { getLogger } from "@/libs/logger";
  import type { SkillSyncState, SkillSyncSummary } from "./api";
  import type { SkillManagerConfig, SkillManagerLabels, SkillManagerOperations } from "./dock";
  import { enhanceSkillPreview } from "./native-preview";
  import type { SkillSyncLogEvent } from "./operation-log";
  import "@/styles/lucide-outline.css";

  type SortMode = "name-asc" | "name-desc" | "state";
  interface ActivityLogEntry extends SkillSyncLogEvent {
    id: number;
    timestamp: Date;
  }

  const syncLogger = getLogger("lets-skill-manager.sync");

  let {
    labels,
    config,
    operations,
    onOpenTab,
    markdownRenderer,
  }: {
    labels: SkillManagerLabels;
    config: SkillManagerConfig;
    operations: SkillManagerOperations;
    onOpenTab?: () => void;
    markdownRenderer: (markdown: string) => string;
  } = $props();

  const stateRank: Record<SkillSyncState, number> = {
    update: 0,
    missing: 1,
    unreadable: 2,
    "target-only": 3,
    synced: 4,
  };
  const sortByState: SortFn<any, SkillSyncSummary> = (rowA, rowB) =>
    stateRank[rowA.original.state] - stateRank[rowB.original.state]
      || rowA.original.name.localeCompare(rowB.original.name);
  const features = tableFeatures({
    columnFilteringFeature,
    globalFilteringFeature,
    filteredRowModel: createFilteredRowModel(),
    filterFns: {
      equalsString: filterFn_equalsString,
      includesString: filterFn_includesString,
    },
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: { statePriority: sortByState, text: sortFn_text },
  });
  const columnHelper = createColumnHelper<typeof features, SkillSyncSummary>();
  const columns = columnHelper.columns([
    columnHelper.accessor("name", { filterFn: "includesString", sortFn: "text" }),
    columnHelper.accessor("description", { filterFn: "includesString", enableSorting: false }),
    columnHelper.accessor("state", { filterFn: "equalsString", sortFn: "statePriority" }),
  ]);

  let skills = $state<SkillSyncSummary[]>([]);
  let installedNames = $state(new Set<string>());
  let selected = $state("");
  let name = $state("");
  let content = $state("");
  let search = $state("");
  let stateFilter = $state("all");
  let sortMode = $state<SortMode>("name-asc");
  let editorMode = $state("preview");
  let status = $state("");
  let statusError = $state(false);
  let busy = $state(false);
  let logs = $state<ActivityLogEntry[]>([]);
  let logsOpen = $state(false);
  let logViewport = $state<HTMLElement>();
  let nextLogId = 0;

  const table = createTable({
    features,
    columns,
    get data() {
      return skills;
    },
    getRowId: (row) => row.name,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) => column.id === "name" || column.id === "description",
    initialState: { sorting: [{ id: "name", desc: false }] },
  });
  const visibleRows = $derived(table.getRowModel().rows);
  const updateCount = $derived(skills.filter((skill) => skill.state === "update").length);
  const previewHtml = $derived.by(() => {
    try {
      return markdownRenderer(content);
    } catch (error) {
      return `<div class="b3-typography">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
    }
  });

  $effect(() => {
    table.setGlobalFilter(search);
  });

  $effect(() => {
    if (!logsOpen || logs.length === 0) return;
    queueMicrotask(() => logViewport?.scrollTo({ top: logViewport.scrollHeight }));
  });

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/gu, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char] || char);
  }

  function nativePreview(node: HTMLElement, _html: string) {
    let active = true;
    const lock = () => node.querySelectorAll<HTMLElement>('[contenteditable="true"]')
      .forEach((element) => element.contentEditable = "false");
    const observer = new MutationObserver(lock);
    observer.observe(node, { childList: true, subtree: true });
    const render = () => queueMicrotask(() => {
      if (!active) return;
      lock();
      enhanceSkillPreview(node);
    });
    render();
    return {
      update: render,
      destroy: () => {
        active = false;
        observer.disconnect();
      },
    };
  }

  function setStatus(message: string, error = false): void {
    status = message;
    statusError = error;
  }

  function appendLog(event: SkillSyncLogEvent): void {
    logs = [...logs, { ...event, id: nextLogId++, timestamp: new Date() }].slice(-200);
    if (event.level === "error") logsOpen = true;
    const context = event.detail ? { stage: event.stage, detail: event.detail } : { stage: event.stage };
    if (event.level === "error") syncLogger.error(event.message, context);
    else syncLogger.info(event.message, context);
  }

  function operationOptions() {
    return { ...config.syncOptions, onLog: appendLog };
  }

  function startOperation(operation: string): void {
    logsOpen = true;
    appendLog({
      level: "info",
      stage: "plan",
      message: `${operation}: ${labels.logStarted}`,
      detail: [
        `backend=${config.syncOptions.backend ?? "builtin"}`,
        `source=${config.sourceRoot}`,
        `destination=${config.syncOptions.destinationRoot || "unavailable"}`,
      ].join("; "),
    });
  }

  function completeOperation(operation: string, message: string): void {
    appendLog({ level: "success", stage: "complete", message: `${operation}: ${labels.logCompleted}`, detail: message });
  }

  function failOperation(operation: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    appendLog({ level: "error", stage: "complete", message: `${operation}: ${labels.logFailed}`, detail: message });
    setStatus(message, true);
  }

  function statusDetail(): string {
    return Object.entries(labels.states)
      .map(([state, label]) => `${label}=${skills.filter((skill) => skill.state === state).length}`)
      .join("; ");
  }

  function formatLogTime(timestamp: Date): string {
    return timestamp.toLocaleTimeString([], { hour12: false });
  }

  function formatLogs(): string {
    return logs.map((entry) => [
      entry.timestamp.toISOString(),
      entry.level.toUpperCase(),
      `[${entry.stage}]`,
      entry.message,
      entry.detail || "",
    ].filter(Boolean).join(" ")).join("\n");
  }

  async function copyActivityLogs(): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatLogs());
      setStatus(labels.logsCopied);
    } catch (error) {
      failOperation(labels.copyLogs, error);
    }
  }

  function clearActivityLogs(): void {
    logs = [];
  }

  function applyStateFilter(value: string): void {
    stateFilter = value;
    table.getColumn("state")?.setFilterValue(value === "all" ? undefined : value);
  }

  function applySort(value: string): void {
    sortMode = value as SortMode;
    table.setSorting(value === "state"
      ? [{ id: "state", desc: false }]
      : [{ id: "name", desc: value === "name-desc" }]);
  }

  function createSkill(): void {
    selected = "";
    name = "";
    content = "";
    editorMode = "edit";
  }

  async function refreshSkills(writeLog = false): Promise<void> {
    busy = true;
    try {
      const installed = (await operations.listSkills()) || [];
      installedNames = new Set(installed.map((skill) => skill.name));
      skills = await operations.inspectSkillSourceRoot(config.sourceRoot);
      if (writeLog) {
        appendLog({
          level: "success",
          stage: "inspect",
          message: labels.logRefresh,
          detail: statusDetail(),
        });
      }
      if (selected && installedNames.has(selected)) await selectSkill(selected);
      else if (installed[0]) await selectSkill(installed[0].name);
      else createSkill();
    } catch (error) {
      if (writeLog) failOperation(labels.refresh, error);
      else setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
    }
  }

  async function selectSkill(skillName: string): Promise<void> {
    try {
      const skill = await operations.getSkill(skillName);
      selected = skillName;
      name = skill.name;
      content = skill.content;
      editorMode = "preview";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  async function saveCurrent(): Promise<void> {
    if (!name.trim()) return setStatus(labels.failed, true);
    busy = true;
    try {
      await operations.saveSkill(name.trim(), content);
      selected = name.trim();
      setStatus(labels.saved);
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
    }
  }

  async function renameCurrent(): Promise<void> {
    if (!selected || !name.trim() || selected === name.trim()) return;
    busy = true;
    try {
      await operations.renameSkill(selected, name.trim());
      selected = name.trim();
      setStatus(labels.saved);
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
    }
  }

  async function removeCurrent(): Promise<void> {
    if (!selected || !window.confirm(labels.confirmRemove)) return;
    busy = true;
    try {
      await operations.removeSkill(selected);
      selected = "";
      setStatus(labels.saved);
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
    }
  }

  async function syncOneSkill(skillName: string): Promise<void> {
    const operation = `${labels.update}: ${skillName}`;
    startOperation(operation);
    busy = true;
    try {
      await operations.syncSkillFromRoot(config.sourceRoot, skillName, operationOptions());
      const message = `${labels.synced}: ${skillName}`;
      setStatus(message);
      completeOperation(operation, message);
      await refreshSkills(true);
    } catch (error) {
      failOperation(operation, error);
    } finally {
      busy = false;
    }
  }

  async function syncAllSkills(): Promise<void> {
    startOperation(labels.syncAll);
    busy = true;
    try {
      const result = await operations.syncSkillSourceRoot(config.sourceRoot, config.onlyChanged, operationOptions());
      const message = labels.syncResult
        .replace("{synced}", String(result.synced))
        .replace("{skipped}", String(result.skipped))
        .replace("{unreadable}", String(result.unreadable));
      setStatus(message);
      completeOperation(labels.syncAll, message);
      await refreshSkills(true);
    } catch (error) {
      failOperation(labels.syncAll, error);
    } finally {
      busy = false;
    }
  }

  async function updateAllSkills(): Promise<void> {
    startOperation(labels.updateAll);
    busy = true;
    try {
      const result = await operations.updateSkillSourceRoot(config.sourceRoot, operationOptions());
      const message = labels.updateResult
        .replace("{updated}", String(result.synced))
        .replace("{skipped}", String(result.skipped))
        .replace("{unreadable}", String(result.unreadable));
      setStatus(message);
      completeOperation(labels.updateAll, message);
      await refreshSkills(true);
    } catch (error) {
      failOperation(labels.updateAll, error);
    } finally {
      busy = false;
    }
  }

  void refreshSkills();
</script>

<section
  class="damophus-skill-manager damophus-theme-root damophus-question-bank-theme"
  aria-label={labels.title}
  data-status={statusError ? "error" : "ok"}
  data-logs-open={logsOpen}
>
  <header class="damophus-skill-manager__toolbar">
    <h2>{labels.title}</h2>
    <Button variant="outline" aria-label={labels.newSkill} onclick={createSkill} disabled={busy}><PlusIcon />{labels.newSkill}</Button>
    <Button variant="outline" aria-label={labels.updateAll} onclick={() => void updateAllSkills()} disabled={busy || updateCount === 0}><DownloadIcon />{labels.updateAll} ({updateCount})</Button>
    <Button variant="outline" aria-label={labels.syncAll} onclick={() => void syncAllSkills()} disabled={busy}><UploadCloudIcon />{labels.syncAll}</Button>
    <Button variant="outline" size="icon" title={labels.refresh} aria-label={labels.refresh} onclick={() => void refreshSkills(true)} disabled={busy}>
      <RefreshCwIcon class={busy ? "animate-spin" : ""} />
    </Button>
    {#if onOpenTab}
      <Button variant="outline" size="icon" title={labels.openTab} aria-label={labels.openTab} onclick={onOpenTab}><ExternalLinkIcon /></Button>
    {/if}
  </header>

  <div class="damophus-skill-manager__source" title={config.sourceRoot}>
    <span>{labels.source}</span><code>{config.sourceRoot}</code>
  </div>

  <div class="damophus-skill-manager__filters">
    <label class="damophus-skill-manager__search">
      <SearchIcon />
      <Input type="search" aria-label={labels.search} placeholder={labels.search} bind:value={search} />
    </label>
    <Select.Root type="single" value={stateFilter} onValueChange={applyStateFilter}>
      <Select.Trigger aria-label={labels.filterState}>{stateFilter === "all" ? labels.allStates : labels.states[stateFilter as SkillSyncState]}</Select.Trigger>
      <Select.Content>
        <Select.Item value="all" label={labels.allStates} />
        {#each Object.entries(labels.states) as [value, label]}
          <Select.Item {value} {label} />
        {/each}
      </Select.Content>
    </Select.Root>
    <Select.Root type="single" value={sortMode} onValueChange={applySort}>
      <Select.Trigger aria-label={labels.sort}>
        {sortMode === "name-desc" ? labels.sortNameDesc : sortMode === "state" ? labels.sortState : labels.sortNameAsc}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="name-asc" label={labels.sortNameAsc} />
        <Select.Item value="name-desc" label={labels.sortNameDesc} />
        <Select.Item value="state" label={labels.sortState} />
      </Select.Content>
    </Select.Root>
    <span class="damophus-skill-manager__count">{labels.visibleCount.replace("{visible}", String(visibleRows.length)).replace("{total}", String(skills.length))}</span>
  </div>

  <div class="damophus-skill-manager__body">
    <div class="damophus-skill-manager__list" role="listbox" aria-label={labels.title}>
      {#if visibleRows.length === 0}
        <div class="damophus-skill-manager__empty">{labels.empty}</div>
      {:else}
        {#each visibleRows as row (row.id)}
          {@const skill = row.original}
          <div class="damophus-skill-manager__item-row">
            <button
              type="button"
              class="damophus-skill-manager__item"
              role="option"
              aria-selected={skill.name === selected}
              disabled={!installedNames.has(skill.name)}
              onclick={() => void selectSkill(skill.name)}
            >
              <strong>{skill.name}</strong>
              <span class="damophus-skill-manager__badge" data-state={skill.state}>{labels.states[skill.state]}</span>
            </button>
            {#if skill.sourcePath && skill.state !== "unreadable"}
              <Button
                class="damophus-skill-manager__update"
                variant="ghost"
                size="icon"
                title={`${labels.update}: ${skill.name}`}
                aria-label={labels.update}
                onclick={() => void syncOneSkill(skill.name)}
                disabled={busy}
              ><DownloadIcon /></Button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="damophus-skill-manager__editor">
      <Input type="text" aria-label={labels.select} bind:value={name} />
      <Tabs.Root bind:value={editorMode} class="damophus-skill-manager__tabs">
        <Tabs.List>
          <Tabs.Trigger value="preview">{labels.preview}</Tabs.Trigger>
          <Tabs.Trigger value="edit">{labels.edit}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="preview" class="damophus-skill-manager__preview-scroll">
          <div class="protyle-wysiwyg protyle-wysiwyg--attr damophus-skill-manager__preview" contenteditable="false" use:nativePreview={previewHtml}>
            {@html previewHtml}
          </div>
        </Tabs.Content>
        <Tabs.Content value="edit" class="damophus-skill-manager__edit-pane">
          <Textarea class="damophus-skill-manager__content" aria-label={labels.content} bind:value={content} spellcheck="false" />
        </Tabs.Content>
      </Tabs.Root>
      <div class="damophus-skill-manager__actions">
        <Button aria-label={labels.save} onclick={() => void saveCurrent()} disabled={busy}><SaveIcon />{labels.save}</Button>
        <Button aria-label={labels.rename} variant="outline" onclick={() => void renameCurrent()} disabled={busy || !selected}><PencilIcon />{labels.rename}</Button>
        <Button aria-label={labels.remove} variant="destructive" onclick={() => void removeCurrent()} disabled={busy || !selected}><Trash2Icon />{labels.remove}</Button>
      </div>
    </div>
  </div>

  <div class="damophus-skill-manager__status" role="status" aria-live="polite">{status}</div>

  <Collapsible.Root bind:open={logsOpen} class="damophus-skill-manager__logs">
    <div class="damophus-skill-manager__logs-header">
      <Collapsible.Trigger class="damophus-skill-manager__logs-trigger" aria-label={labels.logs}>
        <ScrollTextIcon />
        <span>{labels.logs}</span>
        <span class="damophus-skill-manager__logs-count">{logs.length}</span>
        <ChevronDownIcon class={logsOpen ? "damophus-skill-manager__logs-chevron is-open" : "damophus-skill-manager__logs-chevron"} />
      </Collapsible.Trigger>
      <div class="damophus-skill-manager__logs-actions">
        <Button variant="ghost" size="icon-xs" title={labels.copyLogs} aria-label={labels.copyLogs} onclick={() => void copyActivityLogs()} disabled={logs.length === 0}><CopyIcon /></Button>
        <Button variant="ghost" size="icon-xs" title={labels.clearLogs} aria-label={labels.clearLogs} onclick={clearActivityLogs} disabled={logs.length === 0}><Trash2Icon /></Button>
      </div>
    </div>
    <Collapsible.Content>
      <div bind:this={logViewport} class="damophus-skill-manager__logs-viewport" role="log" aria-label={labels.logs} aria-live="polite">
        {#if logs.length === 0}
          <div class="damophus-skill-manager__logs-empty">{labels.logsEmpty}</div>
        {:else}
          {#each logs as entry (entry.id)}
            <div class="damophus-skill-manager__log-entry" data-level={entry.level}>
              <div class="damophus-skill-manager__log-line">
                <time datetime={entry.timestamp.toISOString()}>{formatLogTime(entry.timestamp)}</time>
                <span class="damophus-skill-manager__log-stage">{entry.stage}</span>
                <span>{entry.message}</span>
              </div>
              {#if entry.detail}<pre>{entry.detail}</pre>{/if}
            </div>
          {/each}
        {/if}
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</section>
