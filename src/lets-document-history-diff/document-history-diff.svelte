<script lang="ts">
  import { DiffModeEnum, DiffView } from "@git-diff-view/svelte";
  import "@git-diff-view/svelte/styles/diff-view-pure.css";
  import { createTwoFilesPatch, diffLines } from "diff";
  import {
    AlignJustify,
    Check,
    ChevronLeft,
    ChevronRight,
    Clipboard,
    Columns2,
    Eye,
    FileClock,
    LoaderCircle,
    Minus,
    Plus,
    RefreshCw,
  } from "lucide-svelte";
  import { onMount, tick } from "svelte";
  import { getHostColorMode, observeHostColorMode } from "@/theme/runtime";
  import type { HistoryDiffService } from "./history-service";
  import type { HistoryVersion } from "./types";

  interface Props {
    service: HistoryDiffService;
    documentTitle: string;
    translations: Record<string, string>;
    scope?: "document" | "block";
  }

  type Selection = { kind: "current" } | { kind: "history"; version: HistoryVersion };
  type SourceSide = "before" | "after";

  let { service, documentTitle, translations, scope = "document" }: Props = $props();
  let versions: HistoryVersion[] = $state([]);
  let selection: Selection | undefined = $state();
  let beforeVersion: HistoryVersion | undefined = $state();
  let afterVersion: HistoryVersion | undefined = $state();
  let beforeKramdown = $state("");
  let afterKramdown = $state("");
  let page = $state(1);
  let pageCount = $state(1);
  let totalCount = $state(0);
  let loadingHistory = $state(true);
  let loadingDiff = $state(false);
  let error = $state("");
  let viewMode: "unified" | "split" = $state("split");
  let sourceView: SourceSide | undefined = $state();
  let copiedSource: SourceSide | undefined = $state();
  let scrollElement: HTMLElement | undefined = $state();
  let overviewElement: HTMLButtonElement | undefined = $state();
  let overviewScrollTop = $state(0);
  let overviewClientHeight = $state(1);
  let overviewScrollHeight = $state(1);
  let darkTheme = $state(false);
  let reviewBody: HTMLElement | undefined = $state();
  let sidebarWidth = $state(250);
  let comparisonRequest = 0;

  const SIDEBAR_MIN_WIDTH = 180;
  const SIDEBAR_MAX_WIDTH = 480;
  const SIDEBAR_STORAGE_KEY = "damophus.documentHistoryDiff.sidebarWidth";

  const changes = $derived(diffLines(beforeKramdown, afterKramdown));
  const stats = $derived(changes.reduce((result, change) => ({
    additions: result.additions + (change.added ? change.count ?? 0 : 0),
    deletions: result.deletions + (change.removed ? change.count ?? 0 : 0),
  }), { additions: 0, deletions: 0 }));
  const unchanged = $derived(!loadingDiff && selection !== undefined && stats.additions === 0 && stats.deletions === 0);
  const fullContext = $derived(Math.max(
    beforeKramdown.split(/\r?\n/u).length,
    afterKramdown.split(/\r?\n/u).length,
  ));
  const diffData = $derived({
    oldFile: { fileName: beforeLabel(), fileLang: "markdown", content: beforeKramdown },
    newFile: { fileName: afterLabel(), fileLang: "markdown", content: afterKramdown },
    hunks: [createTwoFilesPatch(
      beforeLabel(),
      afterLabel(),
      beforeKramdown,
      afterKramdown,
      "",
      "",
      { context: fullContext },
    )],
  });

  const t = (key: string): string => translations[key] ?? key;
  const historyLabel = $derived(t(scope === "block" ? "lets-document-history-diff.blockHistory" : "lets-document-history-diff.history"));
  const currentLabel = $derived(t(scope === "block" ? "lets-document-history-diff.currentBlock" : "lets-document-history-diff.current"));

  function versionLabel(version: HistoryVersion | undefined, fallback: string): string {
    if (!version) return fallback;
    const timestamp = formatTime(version.created);
    return `${fallback} · ${timestamp.date} ${timestamp.time}`.trim();
  }

  function beforeLabel(): string {
    return versionLabel(beforeVersion, t("lets-document-history-diff.before"));
  }

  function afterLabel(): string {
    return selection?.kind === "current"
      ? currentLabel
      : versionLabel(afterVersion, t("lets-document-history-diff.after"));
  }

  function isSelected(version: HistoryVersion): boolean {
    return selection?.kind === "history" && selection.version.created === version.created;
  }

  function formatTime(created: string): { date: string; time: string } {
    const date = new Date(Number(created) * 1000);
    if (Number.isNaN(date.getTime())) return { date: created, time: "" };
    return {
      date: new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(date),
      time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date),
    };
  }

  function overviewMarkers(): Array<{ kind: "insert" | "delete"; top: number }> {
    const total = Math.max(1, changes.reduce((count, change) => count + (change.count ?? 0), 0));
    let offset = 0;
    return changes.flatMap((change) => {
      const count = change.count ?? 0;
      const marker = change.added || change.removed
        ? [{ kind: change.added ? "insert" as const : "delete" as const, top: ((offset + count / 2) / total) * 100 }]
        : [];
      offset += count;
      return marker;
    });
  }

  function syncOverview(): void {
    if (!scrollElement) return;
    overviewScrollTop = scrollElement.scrollTop;
    overviewClientHeight = Math.max(1, scrollElement.clientHeight);
    overviewScrollHeight = Math.max(overviewClientHeight, scrollElement.scrollHeight);
  }

  function setViewMode(mode: typeof viewMode): void {
    sourceView = undefined;
    viewMode = mode;
    void tick().then(syncOverview);
  }

  function toggleSource(side: SourceSide): void {
    sourceView = sourceView === side ? undefined : side;
    void tick().then(syncOverview);
  }

  function moveOverview(event: PointerEvent): void {
    if (!overviewElement || !scrollElement) return;
    const rect = overviewElement.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
    scrollElement.scrollTop = ratio * overviewScrollHeight - overviewClientHeight / 2;
    syncOverview();
  }

  function beginOverviewDrag(event: PointerEvent): void {
    overviewElement?.setPointerCapture(event.pointerId);
    moveOverview(event);
  }

  function clampSidebarWidth(width: number): number {
    const available = reviewBody?.clientWidth ?? SIDEBAR_MAX_WIDTH * 2;
    return Math.round(Math.max(SIDEBAR_MIN_WIDTH, Math.min(width, SIDEBAR_MAX_WIDTH, available * 0.48)));
  }

  function setSidebarWidth(width: number, persist = true): void {
    sidebarWidth = clampSidebarWidth(width);
    if (!persist) return;
    try {
      window.sessionStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // Session storage can be disabled in hardened webviews.
    }
  }

  function resizeSidebar(event: PointerEvent): void {
    if (!reviewBody) return;
    const rect = reviewBody.getBoundingClientRect();
    setSidebarWidth(event.clientX - rect.left);
  }

  function beginSidebarResize(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    resizeSidebar(event);
  }

  function handleSidebarResizeKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 40 : 12;
    if (event.key === "ArrowLeft") setSidebarWidth(sidebarWidth - step);
    else if (event.key === "ArrowRight") setSidebarWidth(sidebarWidth + step);
    else if (event.key === "Home") setSidebarWidth(SIDEBAR_MIN_WIDTH);
    else if (event.key === "End") setSidebarWidth(SIDEBAR_MAX_WIDTH);
    else return;
    event.preventDefault();
  }

  async function copySource(side: SourceSide): Promise<void> {
    const value = side === "before" ? beforeKramdown : afterKramdown;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) return;
    }
    copiedSource = side;
    window.setTimeout(() => {
      if (copiedSource === side) copiedSource = undefined;
    }, 1600);
  }

  async function resolveAdjacentVersion(version: HistoryVersion): Promise<HistoryVersion | undefined> {
    const index = versions.findIndex((candidate) => candidate.created === version.created);
    if (index < 0) return undefined;
    if (versions[index + 1]) return versions[index + 1];
    if (page >= pageCount) return undefined;
    const nextPage = await service.loadPage(page + 1);
    return nextPage.versions[0];
  }

  async function select(selectionToLoad: Selection): Promise<void> {
    selection = selectionToLoad;
    sourceView = undefined;
    loadingDiff = true;
    error = "";
    const request = ++comparisonRequest;
    try {
      if (selectionToLoad.kind === "current") {
        const newest = versions[0];
        if (!newest) throw new Error("No history version");
        const resolvedNewest = await service.resolveVersion(newest);
        const [before, after] = await Promise.all([
          service.loadVersionKramdown(resolvedNewest),
          service.loadCurrentKramdown(),
        ]);
        if (request !== comparisonRequest) return;
        beforeVersion = resolvedNewest;
        afterVersion = undefined;
        beforeKramdown = before;
        afterKramdown = after;
        versions = versions.map((candidate) => candidate.created === resolvedNewest.created ? resolvedNewest : candidate);
      } else {
        const [resolvedAfter, adjacent] = await Promise.all([
          service.resolveVersion(selectionToLoad.version),
          resolveAdjacentVersion(selectionToLoad.version),
        ]);
        const resolvedBefore = adjacent ? await service.resolveVersion(adjacent) : undefined;
        const [before, after] = await Promise.all([
          resolvedBefore ? service.loadVersionKramdown(resolvedBefore) : Promise.resolve(""),
          service.loadVersionKramdown(resolvedAfter),
        ]);
        if (request !== comparisonRequest) return;
        beforeVersion = resolvedBefore;
        afterVersion = resolvedAfter;
        beforeKramdown = before;
        afterKramdown = after;
        selection = { kind: "history", version: resolvedAfter };
        versions = versions.map((candidate) => candidate.created === resolvedAfter.created ? resolvedAfter : candidate);
      }
    } catch {
      if (request !== comparisonRequest) return;
      beforeKramdown = "";
      afterKramdown = "";
      error = t("lets-document-history-diff.loadFailed");
    } finally {
      if (request === comparisonRequest) {
        loadingDiff = false;
        await tick();
        syncOverview();
      }
    }
  }

  async function loadPage(nextPage: number): Promise<void> {
    loadingHistory = true;
    error = "";
    comparisonRequest += 1;
    try {
      const result = await service.loadPage(nextPage);
      versions = result.versions;
      page = result.page;
      pageCount = Math.max(1, result.pageCount);
      totalCount = result.totalCount;
      selection = undefined;
      beforeKramdown = "";
      afterKramdown = "";
      if (versions[0]) await select(nextPage === 1 ? { kind: "current" } : { kind: "history", version: versions[0] });
    } catch {
      versions = [];
      selection = undefined;
      error = t("lets-document-history-diff.loadFailed");
    } finally {
      loadingHistory = false;
    }
  }

  function refreshPage(): void {
    service.invalidateCurrent();
    void loadPage(page);
  }

  onMount(() => {
    if (window.matchMedia("(max-width: 760px)").matches) viewMode = "unified";
    darkTheme = getHostColorMode() === "dark";
    const stopObservingColorMode = observeHostColorMode((mode) => {
      darkTheme = mode === "dark";
    });
    try {
      const storedWidth = Number(window.sessionStorage.getItem(SIDEBAR_STORAGE_KEY));
      if (Number.isFinite(storedWidth) && storedWidth > 0) setSidebarWidth(storedWidth, false);
    } catch {
      // Use the default width when session storage is unavailable.
    }
    window.addEventListener("resize", syncOverview);
    void loadPage(1);
    return () => {
      stopObservingColorMode();
      window.removeEventListener("resize", syncOverview);
    };
  });
</script>

<div class="history-review">
  <header class="review-header">
    <div class="document-identity">
      <FileClock size={18} strokeWidth={1.8} />
      <div class="identity-text"><strong>{documentTitle}</strong><span>Kramdown</span></div>
    </div>
    <div class="review-actions">
      <div class="change-stats" aria-live="polite">
        <span class="added"><Plus size={13} />{stats.additions} {t("lets-document-history-diff.additions")}</span>
        <span class="deleted"><Minus size={13} />{stats.deletions} {t("lets-document-history-diff.deletions")}</span>
      </div>
      <div class="view-switch" role="group" aria-label={t("lets-document-history-diff.dialogTitle")}>
        <button type="button" class:active={viewMode === "unified" && !sourceView} aria-pressed={viewMode === "unified" && !sourceView} title={t("lets-document-history-diff.unified")} onclick={() => setViewMode("unified")}><AlignJustify size={16} /><span>{t("lets-document-history-diff.unified")}</span></button>
        <button type="button" class:active={viewMode === "split" && !sourceView} aria-pressed={viewMode === "split" && !sourceView} title={t("lets-document-history-diff.split")} onclick={() => setViewMode("split")}><Columns2 size={16} /><span>{t("lets-document-history-diff.split")}</span></button>
      </div>
      <button class="icon-button" type="button" title={t("lets-document-history-diff.refresh")} aria-label={t("lets-document-history-diff.refresh")} onclick={refreshPage}><RefreshCw size={16} /></button>
    </div>
  </header>

  <div
    class="review-body"
    bind:this={reviewBody}
    style={`--history-sidebar-width: ${sidebarWidth}px`}
  >
    <aside class="history-sidebar">
      <div class="sidebar-title"><span>{historyLabel}</span><span class="count">{totalCount}</span></div>
      <div class="version-list" aria-busy={loadingHistory}>
        {#if page === 1 && versions.length > 0}
          <button type="button" class="version-row current-row" class:selected={selection?.kind === "current"} aria-current={selection?.kind === "current" ? "true" : undefined} onclick={() => select({ kind: "current" })}>
            <span class="current-dot"></span>
            <span class="version-detail"><span class="version-date">{currentLabel}</span><span class="version-operation">{t(scope === "block" ? "lets-document-history-diff.liveBlock" : "lets-document-history-diff.liveDocument")}</span></span>
          </button>
        {/if}
        {#if loadingHistory && versions.length === 0}
          <div class="sidebar-state"><LoaderCircle class="spin" size={20} />{t("lets-document-history-diff.loading")}</div>
        {:else if versions.length === 0}
          <div class="sidebar-state">{error || t("lets-document-history-diff.empty")}</div>
        {:else}
          {#each versions as version (version.created)}
            {@const timestamp = formatTime(version.created)}
            <button type="button" class="version-row" class:selected={isSelected(version)} aria-current={isSelected(version) ? "true" : undefined} onclick={() => select({ kind: "history", version })}>
              <span class="version-date">{timestamp.date}</span>
              <span class="version-detail"><span class="version-time">{timestamp.time}</span><span class="version-operation">{version.operation ?? ""}</span></span>
            </button>
          {/each}
        {/if}
      </div>
      <div class="pagination">
        <button type="button" disabled={page <= 1 || loadingHistory} title={t("lets-document-history-diff.previous")} aria-label={t("lets-document-history-diff.previous")} onclick={() => loadPage(page - 1)}><ChevronLeft size={16} /></button>
        <span>{page} / {pageCount}</span>
        <button type="button" disabled={page >= pageCount || loadingHistory} title={t("lets-document-history-diff.next")} aria-label={t("lets-document-history-diff.next")} onclick={() => loadPage(page + 1)}><ChevronRight size={16} /></button>
      </div>
    </aside>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="sidebar-resizer"
      role="separator"
      aria-label={t("lets-document-history-diff.resizeHistory")}
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={sidebarWidth}
      tabindex="0"
      onkeydown={handleSidebarResizeKey}
      onpointerdown={beginSidebarResize}
      onpointermove={(event) => {
        if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) resizeSidebar(event);
      }}
      onpointerup={(event) => (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)}
      onpointercancel={(event) => (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)}
    ></div>

    <main class="diff-workspace" aria-busy={loadingDiff}>
      {#if selection && !loadingDiff && !error}
        <div class="split-headings">
          <div class="file-heading">
            <span>{beforeLabel()}</span>
            <span class="heading-actions">
              <button type="button" class:active={sourceView === "before"} title={t("lets-document-history-diff.viewBefore")} aria-label={t("lets-document-history-diff.viewBefore")} onclick={() => toggleSource("before")}><Eye size={15} /></button>
              <button type="button" title={t("lets-document-history-diff.copyHistory")} aria-label={t("lets-document-history-diff.copyHistory")} onclick={() => copySource("before")}>{#if copiedSource === "before"}<Check size={15} />{:else}<Clipboard size={15} />{/if}</button>
            </span>
          </div>
          <div class="file-heading">
            <span>{afterLabel()}</span>
            <span class="heading-actions">
              <button type="button" class:active={sourceView === "after"} title={t("lets-document-history-diff.viewAfter")} aria-label={t("lets-document-history-diff.viewAfter")} onclick={() => toggleSource("after")}><Eye size={15} /></button>
              <button type="button" title={t("lets-document-history-diff.copyCurrent")} aria-label={t("lets-document-history-diff.copyCurrent")} onclick={() => copySource("after")}>{#if copiedSource === "after"}<Check size={15} />{:else}<Clipboard size={15} />{/if}</button>
            </span>
          </div>
        </div>
      {/if}

      {#if loadingDiff}
        <div class="workspace-state"><LoaderCircle class="spin" size={22} />{t("lets-document-history-diff.loading")}</div>
      {:else if error}
        <div class="workspace-state error-state">{error}</div>
      {:else if unchanged}
        <div class="workspace-state">{t("lets-document-history-diff.unchanged")}</div>
      {:else if selection && sourceView}
        <pre class="source-scroll" bind:this={scrollElement} onscroll={syncOverview}><code>{sourceView === "before" ? beforeKramdown : afterKramdown}</code></pre>
      {:else if selection}
        <div class="diff-scroll" bind:this={scrollElement} onscroll={syncOverview}>
          <DiffView
            data={diffData}
            diffViewMode={viewMode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
            diffViewTheme={darkTheme ? "dark" : "light"}
            diffViewHighlight={false}
            diffViewWrap={false}
            diffViewFontSize={12}
          />
        </div>
      {/if}

      {#if selection && !loadingDiff && !error}
        <button class="overview-ruler" type="button" bind:this={overviewElement} aria-label={t("lets-document-history-diff.overview")} title={t("lets-document-history-diff.overview")} onpointerdown={beginOverviewDrag} onpointermove={(event) => { if (overviewElement?.hasPointerCapture(event.pointerId)) moveOverview(event); }} onpointerup={(event) => overviewElement?.releasePointerCapture(event.pointerId)} onpointercancel={(event) => overviewElement?.releasePointerCapture(event.pointerId)}>
          {#each overviewMarkers() as marker, index (`${marker.kind}-${marker.top}-${index}`)}<span class="overview-marker {marker.kind}" style={`top: calc(${marker.top}% - 1px)`}></span>{/each}
          <span class="overview-window" style={`top: ${(overviewScrollTop / overviewScrollHeight) * 100}%; height: ${Math.min(100, (overviewClientHeight / overviewScrollHeight) * 100)}%`}></span>
        </button>
      {/if}
    </main>
  </div>
</div>

<style>
  :global(.damophus-document-history-dialog .b3-dialog__body),
  :global(.damophus-document-history-dialog .b3-dialog__content) { overflow: hidden; }
  :global(.damophus-document-history-dialog .b3-dialog__content) { padding: 0; }

  .history-review {
    --history-border: var(--b3-border-color, rgba(127, 127, 127, 0.22));
    display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex-direction: column;
    color: var(--b3-theme-on-background); background: var(--b3-theme-background);
  }
  .review-header { display: flex; min-height: 50px; align-items: center; justify-content: space-between; gap: 16px; padding: 7px 12px 7px 16px; border-bottom: 1px solid var(--history-border); background: var(--b3-theme-surface); }
  .document-identity, .review-actions, .change-stats, .view-switch, .sidebar-title, .pagination, .file-heading, .split-headings, .heading-actions { display: flex; align-items: center; }
  .document-identity { min-width: 0; gap: 10px; }
  .identity-text { display: flex; min-width: 0; flex-direction: column; }
  .identity-text strong { overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .identity-text span, .version-operation, .count { color: var(--b3-theme-on-surface-light); font-size: 11px; }
  .review-actions { flex-shrink: 0; gap: 10px; }
  .change-stats { gap: 9px; font-family: var(--b3-font-family-code, ui-monospace, monospace); font-size: 11px; }
  .change-stats span { display: inline-flex; align-items: center; }
  .added { color: #18794e; } .deleted { color: #c0342b; }
  .view-switch { padding: 2px; border: 1px solid var(--history-border); border-radius: 5px; background: var(--b3-theme-background); }
  .view-switch button, .icon-button, .pagination button, .heading-actions button { display: inline-flex; min-width: 30px; height: 28px; align-items: center; justify-content: center; gap: 6px; padding: 0 8px; border: 0; border-radius: 3px; color: var(--b3-theme-on-surface); background: transparent; cursor: pointer; }
  .view-switch button span { font-size: 12px; }
  .view-switch button.active, .heading-actions button.active { color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); }
  .icon-button { border: 1px solid var(--history-border); border-radius: 5px; }
  button:focus-visible { outline: 2px solid var(--b3-theme-primary); outline-offset: 1px; }
  button:hover:not(:disabled) { background: var(--b3-list-hover); } button:disabled { cursor: default; opacity: 0.4; }

  .review-body { position: relative; display: grid; min-height: 0; flex: 1; grid-template-columns: var(--history-sidebar-width, 250px) minmax(0, 1fr); }
  .history-sidebar { display: flex; min-width: 0; min-height: 0; flex-direction: column; border-right: 1px solid var(--history-border); background: var(--b3-theme-surface); }
  .sidebar-resizer { position: absolute; z-index: 5; top: 0; bottom: 0; left: calc(var(--history-sidebar-width, 250px) - 4px); width: 8px; cursor: col-resize; touch-action: none; }
  .sidebar-resizer::after { position: absolute; top: 0; bottom: 0; left: 3px; width: 2px; background: transparent; content: ""; transition: background 120ms ease; }
  .sidebar-resizer:hover::after,
  .sidebar-resizer:focus-visible::after { background: var(--b3-theme-primary); }
  .sidebar-resizer:focus-visible { outline: none; }
  .sidebar-title { height: 40px; justify-content: space-between; padding: 0 12px 0 16px; border-bottom: 1px solid var(--history-border); font-size: 12px; font-weight: 600; }
  .count { min-width: 24px; text-align: right; }
  .version-list { min-height: 0; flex: 1; overflow: auto; padding: 5px 0; }
  .version-row { display: grid; width: 100%; min-height: 50px; grid-template-columns: 68px minmax(0, 1fr); align-items: center; gap: 8px; padding: 6px 12px 6px 14px; border: 0; border-left: 3px solid transparent; color: inherit; background: transparent; text-align: left; cursor: pointer; }
  .version-row.selected { border-left-color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); }
  .current-row { grid-template-columns: 12px minmax(0, 1fr); }
  .current-dot { width: 8px; height: 8px; border: 2px solid var(--b3-theme-primary); border-radius: 50%; background: var(--b3-theme-background); }
  .version-date { font-size: 12px; font-weight: 600; }
  .version-detail { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
  .version-time { color: var(--b3-theme-on-surface); font-family: var(--b3-font-family-code, ui-monospace, monospace); font-size: 11px; }
  .version-operation { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sidebar-state, .workspace-state { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--b3-theme-on-surface-light); font-size: 13px; }
  .sidebar-state { min-height: 120px; padding: 20px; text-align: center; }
  .pagination { height: 38px; justify-content: space-between; padding: 4px 8px; border-top: 1px solid var(--history-border); font-family: var(--b3-font-family-code, ui-monospace, monospace); font-size: 11px; }

  .diff-workspace { position: relative; display: grid; min-width: 0; min-height: 0; grid-template-rows: auto minmax(0, 1fr); background: var(--b3-theme-background); }
  .workspace-state { grid-row: 1 / -1; min-height: 180px; } .error-state { color: var(--b3-card-error-color, #c0342b); }
  .split-headings { min-width: 0; }
  .file-heading { width: 50%; min-width: 0; height: 38px; justify-content: space-between; gap: 8px; padding: 0 26px 0 12px; border-bottom: 1px solid var(--history-border); background: var(--b3-theme-surface); font-family: var(--b3-font-family-code, ui-monospace, monospace); font-size: 11px; }
  .file-heading + .file-heading { border-left: 1px solid var(--history-border); }
  .file-heading > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .heading-actions { flex-shrink: 0; gap: 2px; }
  .heading-actions button { min-width: 26px; width: 26px; height: 26px; padding: 0; }
  .diff-scroll, .source-scroll { min-width: 0; min-height: 0; overflow: auto; padding-right: 18px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); font-family: var(--b3-font-family-code, ui-monospace, monospace); }
  .source-scroll { margin: 0; padding: 14px 34px 14px 16px; font-size: 12px; line-height: 20px; }
  .source-scroll code { display: block; min-width: max-content; padding: 0; color: inherit; background: transparent; font: inherit; white-space: pre; }
  :global(.diff-scroll > div) { min-width: max-content; }
  :global(.diff-scroll [data-diff-view]) { width: max-content; min-width: 100%; }
  :global(.diff-scroll pre), :global(.diff-scroll code) { letter-spacing: 0; }

  .overview-ruler { position: absolute; z-index: 3; top: 38px; right: 0; bottom: 0; width: 18px; padding: 0; overflow: hidden; border: 0; border-left: 1px solid var(--history-border); border-radius: 0; background: color-mix(in srgb, var(--b3-theme-surface) 84%, transparent); cursor: pointer; touch-action: none; }
  .overview-marker { position: absolute; z-index: 2; height: 3px; pointer-events: none; }
  .overview-marker.delete { left: 1px; width: 8px; background: #b42336; }
  .overview-marker.insert { right: 1px; width: 8px; background: #18794e; }
  .overview-window { position: absolute; z-index: 1; right: 0; left: 0; min-height: 12px; border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 42%, transparent); background: color-mix(in srgb, var(--b3-theme-primary) 16%, transparent); pointer-events: none; }
  .spin { animation: spin 0.85s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 760px) {
    .review-header { gap: 8px; padding: 8px 10px; }
    .document-identity { flex: 1; }
    .identity-text span, .change-stats, .view-switch button span { display: none; }
    .review-actions { gap: 4px; }
    .view-switch button { width: 32px; padding: 0; }
    .review-body { grid-template-columns: 108px minmax(0, 1fr) !important; }
    .sidebar-resizer { display: none; }
    .sidebar-title { padding: 0 8px; }
    .version-row { grid-template-columns: 1fr; gap: 1px; padding: 7px 7px 7px 9px; }
    .current-row { grid-template-columns: 10px minmax(0, 1fr); }
    .version-detail { gap: 0; } .version-operation { display: none; }
    .pagination { padding: 4px; } .pagination span { font-size: 10px; }
    .file-heading { padding: 0 16px 0 7px; }
    .file-heading > span:first-child { display: none; }
    .heading-actions { width: 100%; justify-content: center; }
    .overview-ruler { width: 12px; }
    .overview-marker.delete, .overview-marker.insert { width: 5px; }
  }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
