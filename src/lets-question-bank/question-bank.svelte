<script lang="ts">
  import { onDestroy } from "svelte";
  import { Button } from "@/components/ui/button";
  import { gradeQuestion } from "@/question-bank/core/answer";
  import { restoreQuestionOptions, shuffleQuestionOptions } from "@/question-bank/core/shuffle";
  import type {
    AttemptAggregate,
    MasteryRating,
    Question,
    QuestionGroup,
    ScanMessage,
    ShuffledOption,
    ShuffledQuestion,
    TopicNode,
  } from "@/question-bank/core/types";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import { createPracticeQueue, suggestedMasteryRating, type PracticeOrder } from "@/question-bank/application";
  import type {
    AttemptImportPreview,
    AttemptImportResult,
    QuestionIndexPreview,
  } from "@/question-bank/application";
  import type {
    QuestionBankInitializationPreview,
    QuestionBankRebindingPreview,
  } from "@/question-bank/adapters/siyuan";
  import type { RiffCard } from "@/question-bank/adapters/siyuan";
  import { renderMarkdownHtml } from "@/question-bank/markdown";
  import type { QuestionBankUiController } from "./controller";

  export let controller: QuestionBankUiController;
  export let initialDocumentId: string | undefined = undefined;
  export let translations: Record<string, string> = {};
  export let reviewThreshold = 2;
  export let random: () => number = Math.random;
  export let uuid: () => string = () => crypto.randomUUID();
  export let openQuestionSource: ((blockId: string) => void) | undefined = undefined;
  export let inheritSourceStyles = true;
  export let renderQuestionMarkdown: ((markdown: string, inheritStyles: boolean) => string | undefined) | undefined = undefined;
  export let onInheritSourceStylesChange: ((value: boolean) => void) | undefined = undefined;
  export let timingEnabled = true;

  const label = (key: string, fallback: string) => translations[`lets-question-bank.${key}`] ?? fallback;
  const recent = controller.getRecentScope();
  let documentId = initialDocumentId ?? recent?.documentId ?? "";
  let binding = controller.getBinding();
  let initializationPreview: QuestionBankInitializationPreview | undefined;
  let systemDocumentId = "";
  let rebindingPreview: QuestionBankRebindingPreview | undefined;
  let preview: QuestionIndexPreview | undefined;
  let aggregates: ReadonlyMap<string, AttemptAggregate> = new Map();
  let dueCards: ReadonlyMap<string, RiffCard> = new Map();
  let topicId = "";
  let order: PracticeOrder = "sequential";
  let filter: PracticeFilter = "all";
  let busy = false;
  let error = "";
  let syncComplete = false;
  let fileInput: HTMLInputElement;
  let importSource = "";
  let importPreview: AttemptImportPreview | undefined;
  let importResult: AttemptImportResult | undefined;
  let queue: Question[] = [];
  let questionIndex = 0;
  let currentQuestion: Question | undefined;
  let shuffled: ShuffledQuestion | undefined;
  let displayedOptions: ShuffledOption[] = [];
  let selectedOptionIds: string[] = [];
  let revealed = false;
  let objectiveCorrect: boolean | null = null;
  let subjectiveScore: number | undefined;
  let submitting = false;
  let sessionId = "";
  let sessionStartedAt = 0;
  let questionStartedAt = 0;
  let timerNow = Date.now();
  let timer: ReturnType<typeof setInterval> | undefined;
  let answerCardOpen = false;
  let completedQuestionIndices: number[] = [];
  let questionElapsedByIndex: Record<number, number> = {};
  let complete = false;
  let scanMessageGroups: Array<{ key: string; messages: ScanMessage[] }> = [];

  $: questions = preview?.scan.report.document.questions ?? [];
  $: groups = preview?.scan.report.document.groups ?? [];
  $: topics = preview?.scan.report.document.topics ?? [];
  $: currentGroup = currentQuestion?.metadata.parentId
    ? groups.find((group: QuestionGroup) => group.id === currentQuestion?.metadata.parentId)
    : undefined;
  $: currentQuestionBlockId = currentQuestion
    ? preview?.scan.blockIdsByQuestionId.get(currentQuestion.id)
    : undefined;
  $: scanMessageGroups = preview ? [
    { key: "inferences", messages: preview.scan.report.inferences },
    { key: "issues", messages: preview.scan.report.issues },
    { key: "conflicts", messages: preview.scan.report.conflicts },
    { key: "sourceProblems", messages: preview.scan.sourceIssues },
  ] : [];
  $: suggestedRating = revealed
    ? suggestedMasteryRating(objectiveCorrect, subjectiveScore)
    : undefined;
  $: sessionElapsedMs = timingEnabled && sessionStartedAt
    ? Math.max(0, timerNow - sessionStartedAt)
    : 0;
  $: questionElapsedMs = timingEnabled && questionStartedAt
    ? (questionElapsedByIndex[questionIndex] ?? 0) + Math.max(0, timerNow - questionStartedAt)
    : 0;

  onDestroy(clearTimer);

  function clearTimer(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function startTimer(): void {
    clearTimer();
    timerNow = Date.now();
    if (!timingEnabled) return;
    timer = setInterval(() => {
      timerNow = Date.now();
    }, 1000);
  }

  function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function currentQuestionDuration(now = Date.now()): number | undefined {
    if (!timingEnabled || !questionStartedAt) return undefined;
    return (questionElapsedByIndex[questionIndex] ?? 0) + Math.max(0, now - questionStartedAt);
  }

  function pauseQuestionTimer(): void {
    const elapsed = currentQuestionDuration();
    if (elapsed === undefined) return;
    questionElapsedByIndex = { ...questionElapsedByIndex, [questionIndex]: elapsed };
    questionStartedAt = 0;
  }

  async function run(operation: () => Promise<void>): Promise<void> {
    busy = true;
    error = "";
    try {
      await operation();
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = false;
    }
  }

  function validDocument(): boolean {
    return /^\d{14}-[a-z0-9]{7}$/u.test(documentId);
  }

  function invalidateDocumentTarget(): void {
    clearTimer();
    initializationPreview = undefined;
    preview = undefined;
    syncComplete = false;
    topicId = "";
    queue = [];
    currentQuestion = undefined;
    complete = false;
    answerCardOpen = false;
    completedQuestionIndices = [];
    questionElapsedByIndex = {};
  }

  function invalidateSystemDocumentTarget(): void {
    rebindingPreview = undefined;
  }

  function previewInitialization(): void {
    void run(async () => {
      initializationPreview = await controller.previewInitialization(documentId);
    });
  }

  function confirmInitialization(): void {
    if (!initializationPreview) return;
    void run(async () => {
      binding = await controller.confirmInitialization(initializationPreview!);
      initializationPreview = undefined;
    });
  }

  function previewRebinding(): void {
    void run(async () => {
      rebindingPreview = await controller.previewRebinding(systemDocumentId);
    });
  }

  function confirmRebinding(): void {
    if (!rebindingPreview) return;
    void run(async () => {
      binding = await controller.confirmRebinding(systemDocumentId, rebindingPreview!.token);
      rebindingPreview = undefined;
    });
  }

  function scanDocument(): void {
    void run(async () => {
      preview = await controller.previewSync(documentId);
      if (preview.bindingRepairs.length === 0) {
        [aggregates, dueCards] = await Promise.all([
          controller.loadAggregates(),
          controller.loadDueCards(preview.scan.blockIdsByQuestionId),
        ]);
      } else {
        aggregates = new Map();
        dueCards = new Map();
      }
      syncComplete = false;
      const saved = controller.getRecentScope();
      const savedHeadingBlockId = saved?.documentId === documentId ? saved.headingBlockId : undefined;
      const savedTopicId = savedHeadingBlockId
        ? [...preview.scan.topicBlockIdsByTopicId].find(([, blockId]) => blockId === savedHeadingBlockId)?.[0]
        : saved?.documentId === documentId ? saved.topicId : undefined;
      const topicExists = savedTopicId
        ? preview.scan.report.document.topics.some((topic) => topic.id === savedTopicId)
        : false;
      topicId = topicExists ? savedTopicId! : "";
      if ((savedHeadingBlockId || savedTopicId) && !topicExists) controller.saveRecentScope({ documentId });
    });
  }

  function confirmSync(): void {
    if (!preview) return;
    void run(async () => {
      preview = await controller.confirmSync(documentId, preview!.token);
      const failures = preview.results.filter((result) => result.status === "failed");
      syncComplete = failures.length === 0;
      if (failures.length > 0) {
        error = failures.map((failure) => `${failure.questionId}: ${failure.message ?? "failed"}`).join("; ");
      } else {
        [aggregates, dueCards] = await Promise.all([
          controller.loadAggregates(),
          controller.loadDueCards(preview.scan.blockIdsByQuestionId),
        ]);
      }
    });
  }

  function exportAttempts(): void {
    void run(async () => {
      const source = await controller.exportAttempts();
      const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `damophus-attempts-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  async function selectImportFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await run(async () => {
      importSource = await file.text();
      importResult = undefined;
      importPreview = await controller.previewImport(importSource);
    });
    input.value = "";
  }

  function confirmImport(): void {
    if (!importPreview) return;
    void run(async () => {
      importResult = await controller.confirmImport(importSource, importPreview!.token);
      importPreview = undefined;
      aggregates = await controller.loadAggregates();
    });
  }

  function startPractice(): void {
    if (!preview) return;
    queue = createPracticeQueue({
      questions,
      topics,
      rootTopicId: topicId || undefined,
      filter,
      order,
      aggregates,
      dueQuestionIds: new Set(dueCards.keys()),
      reviewThreshold,
      random,
    });
    controller.saveRecentScope({
      documentId,
      headingBlockId: topicId ? preview.scan.topicBlockIdsByTopicId.get(topicId) : undefined,
    });
    questionIndex = 0;
    sessionId = uuid();
    sessionStartedAt = Date.now();
    completedQuestionIndices = [];
    questionElapsedByIndex = {};
    answerCardOpen = false;
    complete = queue.length === 0;
    if (complete) clearTimer();
    else startTimer();
    selectQuestion(0);
  }

  function selectQuestion(index = questionIndex): void {
    questionIndex = index;
    currentQuestion = queue[questionIndex];
    selectedOptionIds = [];
    revealed = false;
    objectiveCorrect = null;
    subjectiveScore = undefined;
    questionStartedAt = Date.now();
    timerNow = questionStartedAt;
    if (!currentQuestion) {
      shuffled = undefined;
      displayedOptions = [];
      return;
    }
    shuffled = shuffleQuestionOptions(currentQuestion, random);
    displayedOptions = shuffled.options;
  }

  function goToQuestion(index: number): void {
    if (completedQuestionIndices.includes(index) || index === questionIndex) {
      answerCardOpen = false;
      return;
    }
    pauseQuestionTimer();
    selectQuestion(index);
    answerCardOpen = false;
  }

  function toggleOption(optionId: string): void {
    if (!currentQuestion || revealed) return;
    if (currentQuestion.type === "multiple") {
      selectedOptionIds = selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId];
    } else {
      selectedOptionIds = [optionId];
    }
  }

  function revealAnswer(): void {
    if (!currentQuestion || !shuffled) return;
    if (currentQuestion.type !== "subjective" && selectedOptionIds.length === 0) {
      error = label("selectAnswer", "Select an answer before revealing");
      return;
    }
    error = "";
    objectiveCorrect = gradeQuestion(currentQuestion, selectedOptionIds);
    displayedOptions = restoreQuestionOptions(currentQuestion, shuffled);
    revealed = true;
  }

  function retry(): void {
    if (!currentQuestion || !shuffled) return;
    selectedOptionIds = [];
    displayedOptions = shuffled.options;
    objectiveCorrect = null;
    subjectiveScore = undefined;
    revealed = false;
    error = "";
  }

  function submitRating(rating: MasteryRating): void {
    if (!currentQuestion || !shuffled || !revealed || submitting) return;
    submitting = true;
    error = "";
    const durationMs = currentQuestionDuration();
    void controller.submitAttempt({
      questionId: currentQuestion.id,
      questionRelation: preview?.scan.blockIdsByQuestionId.get(currentQuestion.id),
      sessionId,
      questionType: currentQuestion.type,
      optionOrder: shuffled.optionOrder,
      selectedOptionIds,
      objectiveCorrect,
      masteryRating: rating,
      subjectiveScore,
      durationMs,
    }, filter === "due" ? dueCards.get(currentQuestion.id) : undefined).then((result) => {
      if (result.warnings.length > 0) error = result.warnings.join("; ");
      completedQuestionIndices = [...new Set([...completedQuestionIndices, questionIndex])];
      if (completedQuestionIndices.length >= queue.length) {
        complete = true;
        currentQuestion = undefined;
        answerCardOpen = false;
        clearTimer();
      } else {
        const next = queue.findIndex((_, index) => (
          index > questionIndex && !completedQuestionIndices.includes(index)
        ));
        const fallback = queue.findIndex((_, index) => !completedQuestionIndices.includes(index));
        selectQuestion(next >= 0 ? next : fallback);
      }
    }).catch((reason) => {
      error = reason instanceof Error ? reason.message : String(reason);
    }).finally(() => {
      submitting = false;
    });
  }

  function resetPractice(): void {
    clearTimer();
    queue = [];
    currentQuestion = undefined;
    complete = false;
    error = "";
    answerCardOpen = false;
    completedQuestionIndices = [];
    questionElapsedByIndex = {};
    sessionStartedAt = 0;
  }

  function topicLabel(topic: TopicNode): string {
    const depth = Math.max(0, topic.level - 1);
    return `${"  ".repeat(depth)}${topic.title}`;
  }

  function messageContext(message: ScanMessage): string {
    return [
      message.questionId ? `${label("question", "Question")}: ${message.questionId}` : "",
      message.line ? `${label("line", "Line")}: ${message.line}` : "",
    ].filter(Boolean).join(" / ");
  }

  function messageClipboardText(message: ScanMessage): string {
    return [
      `[${message.code}] ${message.message}`,
      message.title ? `${label("heading", "Heading")}: ${message.title}` : "",
      messageContext(message),
      message.sourceMarkdown ? `${label("sourceMarkdown", "Original Markdown")}\n${message.sourceMarkdown}` : "",
    ].filter(Boolean).join("\n");
  }

  function scanLogText(): string {
    return scanMessageGroups
      .filter((group) => group.messages.length > 0)
      .map((group) => [
        label(group.key, group.key),
        ...group.messages.map(messageClipboardText),
      ].join("\n\n"))
      .join("\n\n---\n\n");
  }

  async function copyText(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  function optionMarkdown(option: ShuffledOption): string {
    if (currentQuestion?.type !== "true-false" || option.markdown) return option.markdown;
    return option.originalId === "true"
      ? label("trueAnswer", "True")
      : label("falseAnswer", "False");
  }

  function renderedQuestionContent(markdown: string, sourceStyles: boolean): string {
    return renderQuestionMarkdown?.(markdown, sourceStyles) ?? renderMarkdownHtml(markdown);
  }

  function toggleSourceStyles(event: Event): void {
    inheritSourceStyles = (event.currentTarget as HTMLInputElement).checked;
    onInheritSourceStylesChange?.(inheritSourceStyles);
  }
</script>

<main class="question-bank damophus-theme-root damophus-question-bank-theme flex h-full min-h-0 flex-col overflow-hidden" data-testid="question-bank">
  <header class="app-header">
    <div>
      <h1>Damophus</h1>
      <span>{label("displayName", "Question Bank")}</span>
    </div>
    <div class="header-actions">
      <label class="source-style-toggle">
        <input
          class="b3-switch"
          type="checkbox"
          checked={inheritSourceStyles}
          on:change={toggleSourceStyles}
        />
        <span>{inheritSourceStyles ? label("inheritSourceStyles", "Use source styles") : label("plainDisplay", "Plain display")}</span>
      </label>
      {#if busy}<span class="status">{label("loading", "Working...")}</span>{/if}
    </div>
  </header>

  {#if error}
    <div class="notice error" role="alert"><strong>{label("error", "Operation failed")}</strong><span>{error}</span></div>
  {/if}

  {#if !binding}
    <section class="setup min-h-0 flex-1 overflow-y-auto" aria-label={label("initialize", "Initialize")}>
      <label for="document-id">{label("documentId", "Document ID")}</label>
      <div class="document-row">
        <input id="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" on:input={invalidateDocumentTarget} />
        <button class="primary" disabled={!validDocument() || busy} on:click={previewInitialization}>
          {label("previewInitialization", "Preview initialization")}
        </button>
      </div>
      {#if initializationPreview}
        <div class="preview-line">
          <span>{label("initializationReady", "System document and databases are ready to create")}</span>
          <code>{initializationPreview.path}</code>
          <button class="primary" disabled={busy} on:click={confirmInitialization}>
            {label("confirmInitialization", "Create system document")}
          </button>
        </div>
      {/if}
      <div class="rebind-setup">
        <label for="system-document-id">{label("systemDocumentId", "Existing Damophus system document ID")}</label>
        <div class="document-row">
          <input id="system-document-id" bind:value={systemDocumentId} autocomplete="off" spellcheck="false" on:input={invalidateSystemDocumentTarget} />
          <button class="secondary" disabled={!/^\d{14}-[a-z0-9]{7}$/u.test(systemDocumentId) || busy} on:click={previewRebinding}>
            {label("previewRebinding", "Preview reconnection")}
          </button>
        </div>
        {#if rebindingPreview}
          <div class="preview-line">
            <span>{label("rebindingReady", "Question index and attempt log are ready to reconnect")}</span>
            {#if rebindingPreview.bindingRepairs.length > 0}
              <span>{rebindingPreview.bindingRepairs.length} {label("bindingRepairs", "Database repairs")}</span>
            {/if}
            <button class="primary" disabled={busy} on:click={confirmRebinding}>
              {label("confirmRebinding", "Reconnect")}
            </button>
          </div>
        {/if}
      </div>
    </section>
  {:else if queue.length === 0 && !complete}
    <section class="workspace min-h-0 flex-1 overflow-y-auto">
      <div class="document-row">
        <label for="document-id">{label("documentId", "Document ID")}</label>
        <input id="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" on:input={invalidateDocumentTarget} />
        <button class="icon-button" title={label("scan", "Scan document")} aria-label={label("scan", "Scan document")} disabled={!validDocument() || busy} on:click={scanDocument}>
          <svg aria-hidden="true"><use href="#iconRefresh"></use></svg>
        </button>
      </div>
      <div class="recovery-actions">
        <button class="secondary" disabled={busy} on:click={exportAttempts}>
          <svg aria-hidden="true"><use href="#iconDownload"></use></svg>
          {label("exportAttempts", "Export attempts")}
        </button>
        <button class="secondary" disabled={busy} on:click={() => fileInput.click()}>
          <svg aria-hidden="true"><use href="#iconUpload"></use></svg>
          {label("importAttempts", "Import attempts")}
        </button>
        <input class="file-input" bind:this={fileInput} type="file" accept="application/json,.json" on:change={selectImportFile} />
      </div>

      {#if importPreview}
        <section class="import-report" aria-label={label("importPreview", "Import preview")}>
          <span><strong>{importPreview.importable}</strong>{label("importable", "Importable")}</span>
          <span><strong>{importPreview.duplicateAttemptIds.length}</strong>{label("duplicates", "Duplicates")}</span>
          <span><strong>{importPreview.orphanQuestionIds.length}</strong>{label("orphans", "Orphans")}</span>
          <button class="primary" disabled={busy} on:click={confirmImport}>{label("confirmImport", "Confirm import")}</button>
          {#if importPreview.orphanQuestionIds.length > 0}
            <code>{importPreview.orphanQuestionIds.join(", ")}</code>
          {/if}
          {#if importPreview.existingRowIssues.length > 0}
            <code>{importPreview.existingRowIssues.map((issue) => issue.message).join("; ")}</code>
          {/if}
        </section>
      {/if}

      {#if importResult}
        <section class="import-report result">
          <span><strong>{importResult.imported}</strong>{label("imported", "Imported")}</span>
          <span><strong>{importResult.duplicateAttemptIds.length}</strong>{label("duplicates", "Duplicates")}</span>
          <span><strong>{importResult.orphanQuestionIds.length}</strong>{label("orphans", "Orphans")}</span>
          <span class:danger={importResult.failures.length > 0}><strong>{importResult.failures.length}</strong>{label("failures", "Failures")}</span>
          {#if importResult.failures.length > 0}
            <code>{importResult.failures.map((failure) => failure.attemptId).join(", ")}</code>
          {/if}
        </section>
      {/if}

      {#if preview}
        <section class="scan-summary" aria-label={label("scanSummary", "Scan summary")}>
          <div class="summary-grid">
            <span><strong>{questions.length}</strong>{label("questions", "Questions")}</span>
            <span><strong>{preview.actions.filter((action) => action.kind === "add").length}</strong>{label("additions", "Additions")}</span>
            <span><strong>{preview.actions.filter((action) => action.kind === "update").length}</strong>{label("updates", "Updates")}</span>
            <span><strong>{preview.scan.report.inferences.length}</strong>{label("inferences", "Inferences")}</span>
            <span><strong>{preview.scan.report.issues.length}</strong>{label("issues", "Issues")}</span>
            <span class:danger={preview.blockers.length > 0}><strong>{preview.blockers.length}</strong>{label("blockers", "Blockers")}</span>
          </div>
          <button class="secondary" disabled={busy || preview.blockers.length > 0} on:click={confirmSync}>
            <svg aria-hidden="true"><use href="#iconCheck"></use></svg>
            {label("confirmSync", "Confirm index sync")}
          </button>
          {#if syncComplete}<span class="success">{label("synced", "Question index synchronized")}</span>{/if}
          <details class="scan-details">
            <summary>{label("scanDetails", "Scan details")}</summary>
            <div class="scan-detail-actions">
              <span>{label("inferenceNotice", "Inferences describe detected structure and are not errors.")}</span>
              {#if scanMessageGroups.some((group) => group.messages.length > 0)}
                <button class="secondary compact" type="button" on:click={() => void copyText(scanLogText())}>
                  <svg aria-hidden="true"><use href="#iconCopy"></use></svg>
                  {label("copyScanLog", "Copy scan log")}
                </button>
              {/if}
            </div>
            {#each scanMessageGroups as group}
              {#if group.messages.length > 0}
                <div class="report-group">
                  <strong>{label(group.key, group.key)}</strong>
                  <ul>
                    {#each group.messages as message}
                      <li class="report-message">
                        <div class="report-message-heading">
                          <div>
                            <code>{message.code}</code>
                            <span>{message.message}</span>
                          </div>
                          <button
                            class="icon-button"
                            type="button"
                            aria-label={label("copyFinding", "Copy finding")}
                            title={label("copyFinding", "Copy finding")}
                            on:click={() => void copyText(messageClipboardText(message))}
                          >
                            <svg aria-hidden="true"><use href="#iconCopy"></use></svg>
                          </button>
                        </div>
                        {#if message.title}<strong class="message-title">{label("heading", "Heading")}: {message.title}</strong>{/if}
                        {#if messageContext(message)}<small>{messageContext(message)}</small>{/if}
                        {#if message.sourceMarkdown}
                          <details class="message-source">
                            <summary>{label("sourceMarkdown", "Original Markdown")}</summary>
                            <pre><code>{message.sourceMarkdown}</code></pre>
                          </details>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {/each}
            {#if preview.ialWriteActions.length > 0}
              <div class="report-group">
                <strong>{label("ialUpdates", "IAL updates")}</strong>
                <ul>
                  {#each preview.ialWriteActions as action}
                    <li>
                      <code>{action.reason}</code>
                      <span>{action.questionId}: {JSON.stringify(action.attributes)}</span>
                      <small>{action.blockId}</small>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if preview.bindingRepairs.length > 0}
              <div class="report-group">
                <strong>{label("bindingRepairs", "Database repairs")}</strong>
                <ul>
                  {#each preview.bindingRepairs as repair}
                    <li>
                      <code>{repair.database}</code>
                      <span>{String(repair.field)} ({repair.currentType ? `${repair.currentType} -> ` : ""}{repair.type})</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if preview.staleQuestionIds.length > 0}
              <div class="report-group">
                <strong>{label("staleQuestions", "Stale questions")}</strong>
                <code>{preview.staleQuestionIds.join(", ")}</code>
              </div>
            {/if}
          </details>
        </section>

        <section class="practice-settings">
          <label>
            <span>{label("scope", "Scope")}</span>
            <select bind:value={topicId}>
              <option value="">{label("entireDocument", "Entire document")}</option>
              {#each topics as topic (topic.id)}
                <option value={topic.id}>{topicLabel(topic)}</option>
              {/each}
            </select>
          </label>

          <fieldset>
            <legend>{label("order", "Order")}</legend>
            <div class="segmented">
              <button class:active={order === "sequential"} aria-pressed={order === "sequential"} on:click={() => order = "sequential"}>{label("sequential", "Sequential")}</button>
              <button class:active={order === "random"} aria-pressed={order === "random"} on:click={() => order = "random"}>{label("random", "Random")}</button>
            </div>
          </fieldset>

          <fieldset>
            <legend>{label("filter", "Filter")}</legend>
            <div class="segmented filters">
              {#each ["all", "wrong", "review", "due"] as value}
                <button class:active={filter === value} aria-pressed={filter === value} on:click={() => filter = value as PracticeFilter}>{label(value, value)}</button>
              {/each}
            </div>
          </fieldset>

          <button
            class="primary start"
            disabled={busy || preview.blockers.length > 0 || preview.bindingRepairs.length > 0 || (!syncComplete && preview.actions.some((action) => action.kind === "add"))}
            on:click={startPractice}
          >
            <svg aria-hidden="true"><use href="#iconPlay"></use></svg>
            {label("start", "Start practice")}
          </button>
        </section>
      {/if}
    </section>
  {:else if currentQuestion}
    <section class="practice min-h-0 flex-1 overflow-hidden" aria-live="polite">
      <div class="practice-bar">
        <div class="practice-status">
          <span>{label("progress", "Progress")} {completedQuestionIndices.length + 1} / {queue.length}</span>
          {#if timingEnabled}
            <span class="timer" title={label("sessionElapsed", "Session elapsed time")}>
              <svg aria-hidden="true"><use href="#iconClock"></use></svg>
              {formatDuration(sessionElapsedMs)}
            </span>
          {/if}
        </div>
        <span class="practice-topic">{currentQuestion.metadata.topicPath.join(" / ")}</span>
        <button
          class="icon-button answer-card-button"
          title={label("answerCard", "Answer card")}
          aria-label={label("answerCard", "Answer card")}
          aria-expanded={answerCardOpen}
          on:click={() => answerCardOpen = !answerCardOpen}
        >
          <svg aria-hidden="true"><use href="#iconGrid"></use></svg>
        </button>
      </div>
      {#if answerCardOpen}
        <button
          class="answer-card-scrim"
          aria-label={label("closeAnswerCard", "Close answer card")}
          on:click={() => answerCardOpen = false}
        ></button>
        <aside class="answer-card-panel" aria-label={label("answerCard", "Answer card")}>
          <header>
            <strong>{label("answerCard", "Answer card")}</strong>
            <span>{completedQuestionIndices.length} / {queue.length}</span>
            <button
              class="icon-button"
              title={label("closeAnswerCard", "Close answer card")}
              aria-label={label("closeAnswerCard", "Close answer card")}
              on:click={() => answerCardOpen = false}
            >
              <svg aria-hidden="true"><use href="#iconClose"></use></svg>
            </button>
          </header>
          <div class="answer-card-grid">
            {#each queue as question, index (question.id)}
              <button
                class:current={index === questionIndex}
                class:answered={completedQuestionIndices.includes(index)}
                disabled={completedQuestionIndices.includes(index)}
                aria-current={index === questionIndex ? "step" : undefined}
                aria-label={`${label("question", "Question")} ${index + 1}`}
                on:click={() => goToQuestion(index)}
              >{index + 1}</button>
            {/each}
          </div>
        </aside>
      {/if}
      <div class="practice-content min-h-0 overflow-y-auto overscroll-contain">
        <article class="question">
        <div class="question-heading">
          <h2>{currentQuestion.title}</h2>
          {#if currentQuestionBlockId && openQuestionSource}
            <button
              class="icon-button source-button"
              title={label("openSource", "Open source in SiYuan")}
              aria-label={label("openSource", "Open source in SiYuan")}
              on:click={() => openQuestionSource?.(currentQuestionBlockId as string)}
            >
              <svg aria-hidden="true"><use href="#iconFocus"></use></svg>
            </button>
          {/if}
        </div>
        {#if currentGroup}
          <div class="group-material">
            <strong>{label("sharedMaterial", "Shared material")}</strong>
            <div class="markdown native-content protyle-wysiwyg" contenteditable="false">{@html renderedQuestionContent(currentGroup.materialMarkdown, inheritSourceStyles)}</div>
          </div>
        {/if}
        <div class="markdown native-content protyle-wysiwyg stem" contenteditable="false">{@html renderedQuestionContent(currentQuestion.stemMarkdown, inheritSourceStyles)}</div>
        {#if displayedOptions.length > 0}
          <div class="options">
            {#each displayedOptions as option (option.originalId)}
              <button
                class="option"
                class:selected={selectedOptionIds.includes(option.originalId)}
                disabled={revealed}
                aria-pressed={selectedOptionIds.includes(option.originalId)}
                on:click={() => toggleOption(option.originalId)}
              >
                <span class="option-label">{option.displayLabel}</span>
                <div class="markdown native-content protyle-wysiwyg option-content" contenteditable="false">{@html renderedQuestionContent(optionMarkdown(option), inheritSourceStyles)}</div>
              </button>
            {/each}
          </div>
        {/if}
        </article>

        {#if revealed}
          <section class="answer">
            {#if objectiveCorrect !== null}
              <strong class:correct={objectiveCorrect} class:incorrect={!objectiveCorrect}>
                {objectiveCorrect ? label("correct", "Correct") : label("incorrect", "Incorrect")}
              </strong>
            {/if}
            <div class="markdown native-content protyle-wysiwyg solution" contenteditable="false">{@html renderedQuestionContent(currentQuestion.solutionMarkdown, inheritSourceStyles)}</div>
            {#if currentQuestion.type === "subjective"}
              <label class="score">
                <span>{label("subjectiveScore", "Self score")}</span>
                <input type="number" min="0" max="100" step="1" bind:value={subjectiveScore} />
              </label>
            {/if}
          </section>
        {/if}
      </div>

      {#if !revealed}
        <div class="action-bar">
          {#if timingEnabled}
            <span class="question-timer">{formatDuration(questionElapsedMs)}</span>
          {/if}
          <Button onclick={revealAnswer}>
            <svg data-icon="inline-start" aria-hidden="true"><use href="#iconEye"></use></svg>
            {label("reveal", "Reveal answer")}
          </Button>
        </div>
      {:else}
        <div class="rating-bar">
          <Button variant="outline" size="icon" class="mr-1" title={label("retry", "Undo and retry")} aria-label={label("retry", "Undo and retry")} disabled={submitting} onclick={retry}>
            <svg aria-hidden="true"><use href="#iconUndo"></use></svg>
          </Button>
          {#each ["again", "hard", "good", "easy"] as rating}
            <Button variant={suggestedRating === rating ? "secondary" : "outline"} class="min-w-0 px-1" disabled={submitting} onclick={() => submitRating(rating as MasteryRating)}>{label(rating, rating)}</Button>
          {/each}
        </div>
      {/if}
    </section>
  {:else if complete}
    <section class="completion min-h-0 flex-1 overflow-y-auto">
      <h2>{queue.length === 0 ? label("noQuestions", "No questions match this scope and filter") : label("complete", "Practice complete")}</h2>
      <button class="secondary" on:click={resetPractice}>{label("restart", "Back to scope")}</button>
    </section>
  {/if}
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(button), :global(input), :global(select) { font: inherit; letter-spacing: 0; }
  .question-bank { color: var(--b3-theme-on-background); background: var(--b3-theme-background); font-family: var(--b3-font-family); font-size: var(--b3-font-size); container-type: inline-size; }
  .app-header { min-height: 64px; padding: 12px 20px; border-bottom: 1px solid var(--b3-border-color); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .app-header > div { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  h1 { margin: 0; font-size: 20px; line-height: 1.2; }
  h2 { margin: 0; font-size: 18px; line-height: 1.45; }
  .app-header span, .status { color: var(--b3-theme-on-surface); font-size: 13px; }
  .header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  .source-style-toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
  .source-style-toggle .b3-switch { flex: none; }
  section { padding: 18px 20px; }
  button { min-height: 34px; border: 1px solid var(--b3-border-color); border-radius: 6px; padding: 6px 12px; color: var(--b3-theme-on-background); background: var(--b3-theme-surface); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--b3-list-hover); }
  button:disabled { cursor: default; opacity: .5; }
  button svg { width: 16px; height: 16px; fill: currentColor; flex: none; }
  .primary, .secondary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-weight: 600; }
  .primary { color: var(--b3-theme-on-primary); background: var(--b3-theme-primary); border-color: var(--b3-theme-primary); }
  .secondary { background: var(--b3-theme-surface); }
  .icon-button { width: 34px; min-width: 34px; padding: 7px; display: inline-grid; place-items: center; }
  input, select { min-height: 34px; min-width: 0; border: 1px solid var(--b3-border-color); border-radius: 4px; padding: 6px 9px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); }
  label { color: var(--b3-theme-on-surface); font-size: 13px; }
  .document-row { display: grid; grid-template-columns: auto minmax(220px, 1fr) auto; align-items: center; gap: 10px; }
  .setup { max-width: 760px; }
  .setup > label { display: block; margin-bottom: 7px; }
  .setup .document-row { grid-template-columns: minmax(220px, 1fr) auto; }
  .rebind-setup { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--b3-border-color); }
  .rebind-setup > label { display: block; margin-bottom: 7px; }
  .preview-line { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
  .notice { margin: 12px 20px 0; padding: 10px 12px; border-left: 3px solid var(--b3-theme-error); display: flex; gap: 8px; font-size: 13px; }
  .notice span { overflow-wrap: anywhere; }
  .scan-summary { margin: 18px -20px 0; padding: 16px 20px; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .recovery-actions { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }
  .file-input { display: none; }
  .import-report { margin: 14px -20px 0; padding: 12px 20px; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
  .import-report span { min-width: 76px; display: flex; flex-direction: column; color: var(--b3-theme-on-surface); font-size: 12px; }
  .import-report strong { color: var(--b3-theme-on-background); font-size: 17px; }
  .import-report code { flex-basis: 100%; overflow-wrap: anywhere; }
  .summary-grid { flex: 1; display: grid; grid-template-columns: repeat(6, minmax(74px, 1fr)); gap: 1px; background: var(--b3-border-color); }
  .summary-grid span { min-height: 52px; padding: 7px 9px; background: var(--b3-theme-surface); display: flex; flex-direction: column; justify-content: center; font-size: 12px; color: var(--b3-theme-on-surface); }
  .summary-grid strong { color: var(--b3-theme-on-background); font-size: 17px; }
  .summary-grid .danger strong, .error, .incorrect { color: var(--b3-theme-error); }
  .scan-details { flex-basis: 100%; border-top: 1px solid var(--b3-border-color); padding-top: 10px; user-select: text; }
  .scan-details summary { cursor: pointer; color: var(--b3-theme-on-surface); font-size: 13px; font-weight: 600; }
  .scan-detail-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .scan-detail-actions .compact { min-height: 30px; padding: 4px 9px; white-space: nowrap; user-select: none; }
  .report-group { margin-top: 12px; }
  .report-group > strong { display: block; margin-bottom: 6px; font-size: 13px; }
  .report-group ul { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  .report-group li { min-width: 0; }
  .report-message-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .report-message-heading > div { min-width: 0; }
  .report-message-heading span { margin-left: 8px; overflow-wrap: anywhere; }
  .report-message-heading .icon-button { flex: 0 0 28px; width: 28px; height: 28px; min-height: 28px; padding: 5px; user-select: none; }
  .message-title { display: block; margin-top: 5px; overflow-wrap: anywhere; }
  .report-group small { display: block; margin-top: 2px; color: var(--b3-theme-on-surface); overflow-wrap: anywhere; }
  .message-source { margin-top: 6px; }
  .message-source pre { max-height: 180px; margin: 6px 0 0; padding: 8px; overflow: auto; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-background); white-space: pre-wrap; overflow-wrap: anywhere; }
  .message-source pre code { font-size: 12px; user-select: text; }
  .success, .correct { color: var(--b3-theme-success); font-size: 13px; }
  .practice-settings { padding: 20px 0 0; display: grid; grid-template-columns: minmax(180px, 1.4fr) minmax(180px, 1fr) minmax(250px, 1.5fr) auto; gap: 16px; align-items: end; }
  .practice-settings > label { display: grid; gap: 6px; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  legend { margin-bottom: 6px; color: var(--b3-theme-on-surface); font-size: 13px; }
  .segmented { min-height: 34px; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; }
  .segmented button { border-radius: 0; margin-left: -1px; white-space: nowrap; }
  .segmented button:first-child { margin-left: 0; border-radius: 4px 0 0 4px; }
  .segmented button:last-child { border-radius: 0 4px 4px 0; }
  .segmented button.active { position: relative; color: var(--b3-theme-primary); border-color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); }
  .practice { position: relative; min-height: 0; padding: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; }
  .practice-bar { min-height: 44px; padding: 5px 14px 5px 20px; border-bottom: 1px solid var(--b3-border-color); display: grid; grid-template-columns: auto minmax(0, 1fr) 34px; align-items: center; gap: 12px; color: var(--b3-theme-on-surface); font-size: 13px; }
  .practice-status { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
  .timer { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
  .timer svg { width: 14px; height: 14px; fill: currentColor; }
  .practice-topic { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
  .answer-card-scrim { position: absolute; z-index: 3; inset: 44px 0 58px; width: 100%; min-height: 0; padding: 0; border: 0; border-radius: 0; background: color-mix(in srgb, var(--b3-theme-background) 54%, transparent); }
  .answer-card-panel { position: absolute; z-index: 4; top: 52px; right: 12px; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 122px); padding: 14px; border: 1px solid var(--b3-border-color); border-radius: 6px; background: var(--b3-theme-background); box-shadow: var(--b3-dialog-shadow); overflow: auto; }
  .answer-card-panel header { min-height: 34px; display: grid; grid-template-columns: minmax(0, 1fr) auto 34px; align-items: center; gap: 10px; }
  .answer-card-panel header span { color: var(--b3-theme-on-surface); font-size: 12px; }
  .answer-card-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(5, minmax(38px, 1fr)); gap: 8px; }
  .answer-card-grid button { aspect-ratio: 1; min-width: 0; min-height: 38px; padding: 4px; font-variant-numeric: tabular-nums; }
  .answer-card-grid button.current { color: var(--b3-theme-on-primary); border-color: var(--b3-theme-primary); background: var(--b3-theme-primary); }
  .answer-card-grid button.answered { color: var(--b3-theme-success); border-color: var(--b3-theme-success); background: var(--b3-theme-surface); opacity: 1; }
  .question { max-width: 920px; margin: 0 auto; padding: 24px 22px 8px; }
  .question-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .question-heading h2 { min-width: 0; overflow-wrap: anywhere; }
  .source-button { flex: none; }
  .markdown { min-width: 0; overflow-wrap: anywhere; }
  .native-content.protyle-wysiwyg { display: block; min-height: 0; padding: 0; overflow: visible; }
  .native-content.protyle-wysiwyg :global([data-node-id]) { max-width: 100%; }
  .native-content.protyle-wysiwyg :global(.protyle-attr),
  .native-content.protyle-wysiwyg :global(.protyle-action),
  .native-content.protyle-wysiwyg :global(.protyle-icons) { display: none !important; }
  .markdown :global(p:first-child) { margin-top: 0; }
  .markdown :global(p:last-child) { margin-bottom: 0; }
  .stem { margin-top: 14px; line-height: 1.75; }
  .group-material { margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); }
  .group-material > strong { display: block; margin-bottom: 8px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .options { margin-top: 18px; display: grid; gap: 8px; }
  .option { width: 100%; min-height: 48px; padding: 9px 12px; display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: start; gap: 8px; text-align: left; background: transparent; }
  .option.selected { border-color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); }
  .option-label { width: 26px; height: 26px; border: 1px solid var(--b3-border-color); border-radius: 50%; display: grid; place-items: center; font-weight: 600; }
  .option-content { align-self: center; width: 100%; }
  .option-content :global([data-node-id]) { margin: 0; padding: 0; min-height: 0; }
  .answer { max-width: 920px; margin: 16px auto 0; padding: 18px 22px 24px; border-top: 1px solid var(--b3-border-color); }
  .solution { margin-top: 12px; line-height: 1.7; }
  .score { margin-top: 16px; display: flex; align-items: center; gap: 10px; }
  .score input { width: 92px; }
  .action-bar, .rating-bar { min-height: 58px; padding: 10px 20px; border-top: 1px solid var(--b3-border-color); background: var(--b3-theme-background); display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
  .action-bar:has(.question-timer) { justify-content: space-between; }
  .question-timer { color: var(--b3-theme-on-surface); font-size: 12px; font-variant-numeric: tabular-nums; }
  .rating-bar { display: grid; grid-template-columns: 34px repeat(4, minmax(76px, 112px)); }
  .completion { min-height: 240px; display: grid; place-content: center; justify-items: center; gap: 16px; text-align: center; }

  @container (max-width: 760px) {
    .app-header { padding-inline: 14px; }
    .app-header { align-items: flex-start; }
    .header-actions { flex-direction: column; align-items: flex-end; gap: 6px; }
    section { padding: 14px; }
    .document-row { grid-template-columns: 1fr 34px; }
    .document-row label { grid-column: 1 / -1; }
    .scan-summary { margin-inline: -14px; padding-inline: 14px; }
    .recovery-actions { justify-content: stretch; }
    .recovery-actions button { flex: 1; }
    .import-report { margin-inline: -14px; padding-inline: 14px; }
    .summary-grid { grid-template-columns: repeat(3, 1fr); flex-basis: 100%; }
    .practice-settings { grid-template-columns: 1fr; gap: 13px; }
    .practice-settings .start { width: 100%; }
    .filters { grid-auto-flow: row; grid-template-columns: repeat(2, 1fr); }
    .filters button, .filters button:first-child, .filters button:last-child { margin: -1px 0 0 -1px; border-radius: 0; }
    .practice-bar { padding-inline: 10px 8px; grid-template-columns: auto minmax(0, 1fr) 34px; gap: 8px; }
    .practice-status { gap: 8px; }
    .practice-topic { text-align: left; }
    .answer-card-panel { top: 44px; right: 0; bottom: 58px; width: 100%; max-height: none; border-width: 0 0 1px; border-radius: 0; box-shadow: none; }
    .answer-card-grid { grid-template-columns: repeat(5, minmax(36px, 1fr)); }
    .question, .answer { padding-inline: 14px; }
    .rating-bar { grid-template-columns: 34px repeat(4, minmax(0, 1fr)); padding: 8px; gap: 5px; }
  }
</style>
