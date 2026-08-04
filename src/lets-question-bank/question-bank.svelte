<script lang="ts">
  import { gradeQuestion } from "@/question-bank/core/answer";
  import { restoreQuestionOptions, shuffleQuestionOptions } from "@/question-bank/core/shuffle";
  import type {
    AttemptAggregate,
    MasteryRating,
    Question,
    QuestionGroup,
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
  let topicId = recent?.documentId === documentId ? recent.topicId ?? "" : "";
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
  let questionStartedAt = 0;
  let complete = false;

  $: questions = preview?.scan.report.document.questions ?? [];
  $: groups = preview?.scan.report.document.groups ?? [];
  $: topics = preview?.scan.report.document.topics ?? [];
  $: currentGroup = currentQuestion?.metadata.parentId
    ? groups.find((group: QuestionGroup) => group.id === currentQuestion?.metadata.parentId)
    : undefined;
  $: suggestedRating = revealed
    ? suggestedMasteryRating(objectiveCorrect, subjectiveScore)
    : undefined;

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
      [aggregates, dueCards] = await Promise.all([
        controller.loadAggregates(),
        controller.loadDueCards(preview.scan.blockIdsByQuestionId),
      ]);
      syncComplete = false;
      const saved = controller.getRecentScope();
      const savedTopicId = saved?.documentId === documentId ? saved.topicId : undefined;
      const topicExists = savedTopicId
        ? preview.scan.report.document.topics.some((topic) => topic.id === savedTopicId)
        : false;
      topicId = topicExists ? savedTopicId! : "";
      if (savedTopicId && !topicExists) controller.saveRecentScope({ documentId });
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
    controller.saveRecentScope({ documentId, topicId: topicId || undefined });
    questionIndex = 0;
    sessionId = uuid();
    complete = queue.length === 0;
    selectQuestion();
  }

  function selectQuestion(): void {
    currentQuestion = queue[questionIndex];
    selectedOptionIds = [];
    revealed = false;
    objectiveCorrect = null;
    subjectiveScore = undefined;
    questionStartedAt = Date.now();
    if (!currentQuestion) {
      shuffled = undefined;
      displayedOptions = [];
      return;
    }
    shuffled = shuffleQuestionOptions(currentQuestion, random);
    displayedOptions = shuffled.options;
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
      durationMs: Date.now() - questionStartedAt,
    }, filter === "due" ? dueCards.get(currentQuestion.id) : undefined).then((result) => {
      if (result.warnings.length > 0) error = result.warnings.join("; ");
      questionIndex += 1;
      if (questionIndex >= queue.length) {
        complete = true;
        currentQuestion = undefined;
      } else {
        selectQuestion();
      }
    }).catch((reason) => {
      error = reason instanceof Error ? reason.message : String(reason);
    }).finally(() => {
      submitting = false;
    });
  }

  function resetPractice(): void {
    queue = [];
    currentQuestion = undefined;
    complete = false;
    error = "";
  }

  function topicLabel(topic: TopicNode): string {
    const depth = Math.max(0, topic.level - 1);
    return `${"  ".repeat(depth)}${topic.title}`;
  }
</script>

<main class="question-bank" data-testid="question-bank">
  <header class="app-header">
    <div>
      <h1>Damophus</h1>
      <span>{label("displayName", "Question Bank")}</span>
    </div>
    {#if busy}<span class="status">{label("loading", "Working...")}</span>{/if}
  </header>

  {#if error}
    <div class="notice error" role="alert"><strong>{label("error", "Operation failed")}</strong><span>{error}</span></div>
  {/if}

  {#if !binding}
    <section class="setup" aria-label={label("initialize", "Initialize")}>
      <label for="document-id">{label("documentId", "Document ID")}</label>
      <div class="document-row">
        <input id="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" />
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
          <input id="system-document-id" bind:value={systemDocumentId} autocomplete="off" spellcheck="false" />
          <button class="secondary" disabled={!/^\d{14}-[a-z0-9]{7}$/u.test(systemDocumentId) || busy} on:click={previewRebinding}>
            {label("previewRebinding", "Preview reconnection")}
          </button>
        </div>
        {#if rebindingPreview}
          <div class="preview-line">
            <span>{label("rebindingReady", "Question index and attempt log are ready to reconnect")}</span>
            <button class="primary" disabled={busy} on:click={confirmRebinding}>
              {label("confirmRebinding", "Reconnect")}
            </button>
          </div>
        {/if}
      </div>
    </section>
  {:else if queue.length === 0 && !complete}
    <section class="workspace">
      <div class="document-row">
        <label for="document-id">{label("documentId", "Document ID")}</label>
        <input id="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" />
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

          <button class="primary start" on:click={startPractice}>
            <svg aria-hidden="true"><use href="#iconPlay"></use></svg>
            {label("start", "Start practice")}
          </button>
        </section>
      {/if}
    </section>
  {:else if currentQuestion}
    <section class="practice" aria-live="polite">
      <div class="practice-bar">
        <span>{label("progress", "Progress")} {questionIndex + 1} / {queue.length}</span>
        <span>{currentQuestion.metadata.topicPath.join(" / ")}</span>
      </div>
      <article class="question">
        <h2>{currentQuestion.title}</h2>
        {#if currentGroup}
          <div class="group-material">
            <strong>{label("sharedMaterial", "Shared material")}</strong>
            <div class="markdown">{@html renderMarkdownHtml(currentGroup.materialMarkdown)}</div>
          </div>
        {/if}
        <div class="markdown stem">{@html renderMarkdownHtml(currentQuestion.stemMarkdown)}</div>
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
                <span class="markdown">{@html renderMarkdownHtml(option.markdown)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </article>

      {#if !revealed}
        <div class="action-bar">
          <button class="primary" on:click={revealAnswer}>
            <svg aria-hidden="true"><use href="#iconEye"></use></svg>
            {label("reveal", "Reveal answer")}
          </button>
        </div>
      {:else}
        <section class="answer">
          {#if objectiveCorrect !== null}
            <strong class:correct={objectiveCorrect} class:incorrect={!objectiveCorrect}>
              {objectiveCorrect ? label("correct", "Correct") : label("incorrect", "Incorrect")}
            </strong>
          {/if}
          <div class="markdown solution">{@html renderMarkdownHtml(currentQuestion.solutionMarkdown)}</div>
          {#if currentQuestion.type === "subjective"}
            <label class="score">
              <span>{label("subjectiveScore", "Self score")}</span>
              <input type="number" min="0" max="100" step="1" bind:value={subjectiveScore} />
            </label>
          {/if}
        </section>
        <div class="rating-bar">
          <button class="icon-button retry" title={label("retry", "Undo and retry")} aria-label={label("retry", "Undo and retry")} disabled={submitting} on:click={retry}>
            <svg aria-hidden="true"><use href="#iconUndo"></use></svg>
          </button>
          {#each ["again", "hard", "good", "easy"] as rating}
            <button class="rating {rating}" class:suggested={suggestedRating === rating} disabled={submitting} on:click={() => submitRating(rating as MasteryRating)}>{label(rating, rating)}</button>
          {/each}
        </div>
      {/if}
    </section>
  {:else if complete}
    <section class="completion">
      <h2>{queue.length === 0 ? label("noQuestions", "No questions match this scope and filter") : label("complete", "Practice complete")}</h2>
      <button class="secondary" on:click={resetPractice}>{label("restart", "Back to scope")}</button>
    </section>
  {/if}
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(button), :global(input), :global(select) { font: inherit; letter-spacing: 0; }
  .question-bank { min-height: 100%; color: var(--b3-theme-on-background); background: var(--b3-theme-background); container-type: inline-size; }
  .app-header { min-height: 64px; padding: 12px 20px; border-bottom: 1px solid var(--b3-border-color); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .app-header > div { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  h1 { margin: 0; font-size: 20px; line-height: 1.2; }
  h2 { margin: 0; font-size: 18px; line-height: 1.45; }
  .app-header span, .status { color: var(--b3-theme-on-surface); font-size: 13px; }
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
  .practice { padding: 0; }
  .practice-bar { min-height: 42px; padding: 8px 20px; border-bottom: 1px solid var(--b3-border-color); display: flex; justify-content: space-between; gap: 12px; color: var(--b3-theme-on-surface); font-size: 13px; }
  .question { max-width: 920px; margin: 0 auto; padding: 24px 22px 8px; }
  .markdown { min-width: 0; overflow-wrap: anywhere; }
  .markdown :global(p:first-child) { margin-top: 0; }
  .markdown :global(p:last-child) { margin-bottom: 0; }
  .stem { margin-top: 14px; line-height: 1.75; }
  .group-material { margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); }
  .group-material > strong { display: block; margin-bottom: 8px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .options { margin-top: 18px; display: grid; gap: 8px; }
  .option { width: 100%; min-height: 48px; padding: 9px 12px; display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: start; gap: 8px; text-align: left; background: transparent; }
  .option.selected { border-color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); }
  .option-label { width: 26px; height: 26px; border: 1px solid var(--b3-border-color); border-radius: 50%; display: grid; place-items: center; font-weight: 600; }
  .answer { max-width: 920px; margin: 16px auto 0; padding: 18px 22px; border-top: 1px solid var(--b3-border-color); }
  .solution { margin-top: 12px; line-height: 1.7; }
  .score { margin-top: 16px; display: flex; align-items: center; gap: 10px; }
  .score input { width: 92px; }
  .action-bar, .rating-bar { position: sticky; bottom: 0; min-height: 58px; padding: 10px 20px; border-top: 1px solid var(--b3-border-color); background: var(--b3-theme-background); display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
  .rating-bar { display: grid; grid-template-columns: 34px repeat(4, minmax(76px, 112px)); }
  .rating { font-weight: 600; }
  .rating.again { color: var(--b3-theme-error); }
  .rating.hard { color: #b45f06; }
  .rating.good { color: #24734f; }
  .rating.easy { color: #2364aa; }
  .rating.suggested { border-width: 2px; border-color: currentColor; background: var(--b3-theme-surface); }
  .retry { margin-right: 4px; }
  .completion { min-height: 240px; display: grid; place-content: center; justify-items: center; gap: 16px; text-align: center; }

  @container (max-width: 760px) {
    .app-header { padding-inline: 14px; }
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
    .practice-bar { padding-inline: 14px; }
    .practice-bar span:last-child { max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .question, .answer { padding-inline: 14px; }
    .rating-bar { grid-template-columns: 34px repeat(4, minmax(0, 1fr)); padding: 8px; gap: 5px; }
    .rating { min-width: 0; padding-inline: 4px; }
  }
</style>
