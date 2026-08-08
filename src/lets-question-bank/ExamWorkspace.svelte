<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock3, Flag, Layers3, Send, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Checkbox } from "@/components/ui/checkbox";
  import { Label } from "@/components/ui/label";
  import * as Select from "@/components/ui/select";
  import { Textarea } from "@/components/ui/textarea";
  import type { Question } from "@/question-bank/core/types";
  import type { FrozenQuestionSet, QuestionCatalogEntry, QuestionSetBlueprint } from "@/question-bank/assembly";
  import type { QuestionSourceDocument } from "@/question-bank/adapters/siyuan/source-catalog";
  import type { QuestionIndexBatchPreview } from "@/question-bank/application";
  import {
    buildExamSubmissionPlan,
    buildExamSummaryEvent,
    createExamSessionActor,
    createExamSessionSnapshot,
    scoreExam,
    type ExamBlueprint,
    type ExamSessionActor,
    type ExamSessionSnapshot,
  } from "@/question-bank/exam";
  import type { QuestionBankUiController } from "./controller";
  import QuestionSetComposer from "./QuestionSetComposer.svelte";

  export let controller: QuestionBankUiController;
  export let questions: Question[] = [];
  export let blockIdsByQuestionId: ReadonlyMap<string, string> = new Map();
  export let sourceKey = "";
  export let sourceLabel = "";
  export let translations: Record<string, string> = {};
  export let uuid: () => string = () => crypto.randomUUID();
  export let random: () => number = Math.random;
  export let renderQuestionMarkdown: ((markdown: string, inheritStyles: boolean) => string | undefined) | undefined = undefined;
  export let onClose: (() => void) | undefined = undefined;

  const label = (key: string, fallback: string) => translations[`lets-question-bank.${key}`] ?? fallback;
  let phase: "setup" | "active" | "result" = "setup";
  let snapshot: ExamSessionSnapshot | undefined;
  let actor: ExamSessionActor | undefined;
  let actorState: ReturnType<ExamSessionActor["getSnapshot"]> | undefined;
  let questionCount = Math.min(questions.length, 100);
  let timeLimitMinutes = 90;
  let strictTimeout = false;
  let allowAnswerReveal = false;
  let scoringMode: ExamBlueprint["scoring_mode"] = "legal-exam";
  let order: ExamBlueprint["order"] = "sequential";
  let questionIndex = 0;
  let now = Date.now();
  let clock: ReturnType<typeof setInterval> | undefined;
  let busy = false;
  let error = "";
  let submittedSummary: ReturnType<typeof scoreExam> | undefined;
  let overdue = false;
  let unsubscribe: (() => void) | undefined;
  let activeQuestions: Question[] = questions;
  let activeBlockIdsByQuestionId: ReadonlyMap<string, string> = blockIdsByQuestionId;
  let sourceDocuments: QuestionSourceDocument[] = [];
  let questionCatalog: QuestionCatalogEntry[] = [];
  let questionSetBlueprints: QuestionSetBlueprint[] = [];
  let composerOpen = false;
  let frozenSet: FrozenQuestionSet | undefined;
  let frozenSetLabel = "";

  $: currentQuestion = snapshot ? activeQuestions.find((question) => question.id === snapshot.current_question_id) : undefined;
  $: currentDraft = currentQuestion && snapshot ? snapshot.drafts[currentQuestion.id] : undefined;
  $: remainingMs = snapshot?.deadline_at ? Date.parse(snapshot.deadline_at) - now : undefined;
  $: if (actorState?.value === "submitting" && !busy) void submitRows();

  onMount(() => {
    void loadQuestionSetData();
    void loadStored();
    clock = setInterval(() => {
      now = Date.now();
      if (!actor || !snapshot || phase !== "active") return;
      actor.send({ type: "CHECK_DEADLINE", now });
      syncActor();
    }, 1000);
  });

  onDestroy(() => {
    if (clock) clearInterval(clock);
    unsubscribe?.();
    actor?.stop();
  });

  async function loadStored(): Promise<void> {
    if (!controller.loadExamSession) return;
    const stored = await controller.loadExamSession();
    if (!stored) return;
    if (controller.hydrateQuestionSources) {
      const hydrated = await controller.hydrateQuestionSources(stored.queue_question_ids);
      activeQuestions = hydrated.questions;
      activeBlockIdsByQuestionId = hydrated.blockIdsByQuestionId;
    } else {
      const available = new Set(questions.map((question) => question.id));
      if (stored.queue_question_ids.some((questionId) => !available.has(questionId))) return;
      activeQuestions = questions;
      activeBlockIdsByQuestionId = blockIdsByQuestionId;
    }
    snapshot = stored;
    phase = stored.status === "active" || stored.status === "submitting" || stored.status === "submit-failed"
      ? "active"
      : "result";
    questionIndex = Math.max(0, stored.queue_question_ids.indexOf(stored.current_question_id));
    submittedSummary = phase === "result" ? scoreExam(stored, activeQuestions) : undefined;
    startActor(stored);
  }

  async function loadQuestionSetData(): Promise<void> {
    if (!controller.listQuestionSourceDocuments || !controller.loadQuestionCatalog || !controller.listQuestionSetBlueprints) return;
    try {
      [sourceDocuments, questionCatalog, questionSetBlueprints] = await Promise.all([
        controller.listQuestionSourceDocuments(),
        controller.loadQuestionCatalog(),
        controller.listQuestionSetBlueprints(),
      ]);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function previewSourceSync(documentIds: readonly string[]): Promise<QuestionIndexBatchPreview> {
    if (!controller.previewSyncBatch) throw new Error("Cross-document indexing is unavailable");
    return controller.previewSyncBatch(documentIds);
  }

  async function confirmSourceSync(preview: QuestionIndexBatchPreview): Promise<QuestionIndexBatchPreview> {
    if (!controller.confirmSyncBatch) throw new Error("Cross-document indexing is unavailable");
    const confirmed = await controller.confirmSyncBatch(preview.documentIds, preview.token);
    await loadQuestionSetData();
    return confirmed;
  }

  function assembleBlueprint(blueprint: QuestionSetBlueprint): FrozenQuestionSet {
    if (!controller.assembleQuestionSet) throw new Error("Cross-document assembly is unavailable");
    const sourceRevision = questionCatalog
      .map((entry) => `${entry.questionId}:${entry.blockId}:${entry.indexedAt ?? ""}`)
      .sort()
      .join("|");
    frozenSetLabel = blueprint.name;
    return controller.assembleQuestionSet({
      blueprint,
      catalog: questionCatalog,
      sourceRevision,
      setId: crypto.randomUUID(),
      seed: crypto.randomUUID(),
    });
  }

  async function saveBlueprint(blueprint: QuestionSetBlueprint): Promise<void> {
    await controller.saveQuestionSetBlueprint?.(blueprint);
    questionSetBlueprints = await controller.listQuestionSetBlueprints?.() ?? questionSetBlueprints;
  }

  async function removeBlueprint(blueprintId: string): Promise<void> {
    await controller.removeQuestionSetBlueprint?.(blueprintId);
    questionSetBlueprints = await controller.listQuestionSetBlueprints?.() ?? [];
  }

  async function useFrozenSet(next: FrozenQuestionSet): Promise<void> {
    if (!controller.hydrateQuestionSources) throw new Error("Cross-document source hydration is unavailable");
    busy = true;
    try {
      const hydrated = await controller.hydrateQuestionSources(next.question_ids);
      activeQuestions = hydrated.questions;
      activeBlockIdsByQuestionId = hydrated.blockIdsByQuestionId;
      frozenSet = next;
      questionCount = next.question_ids.length;
      order = "sequential";
      composerOpen = false;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  function startActor(next: ExamSessionSnapshot): void {
    unsubscribe?.();
    actor?.stop();
    actor = createExamSessionActor(next);
    actorState = actor.getSnapshot();
    const subscription = actor.subscribe((state) => {
      actorState = state;
      snapshot = state.context.session;
      overdue = Boolean(snapshot.overdue_at);
      void persist(snapshot);
    });
    unsubscribe = () => subscription.unsubscribe();
    actor.start();
  }

  async function persist(next: ExamSessionSnapshot): Promise<void> {
    if (!controller.saveExamSession) return;
    try {
      await controller.saveExamSession(next, next.revision === 0 ? undefined : next.revision - 1);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  function startExam(): void {
    error = "";
    if (activeQuestions.length === 0) return;
    const selected = frozenSet
      ? frozenSet.question_ids.map((questionId) => activeQuestions.find((question) => question.id === questionId)!).filter(Boolean)
      : activeQuestions.slice(0, Math.max(1, Math.min(questionCount, activeQuestions.length)));
    const blueprint: ExamBlueprint = {
      schema_version: 1,
      title: frozenSetLabel || sourceLabel || "Damophus Exam",
      source_key: frozenSet?.set_id ?? sourceKey,
      source_label: frozenSetLabel || sourceLabel,
      question_ids: selected.map((question) => question.id),
      order: frozenSet ? "sequential" : order,
      time_limit_ms: Math.max(0, timeLimitMinutes) * 60_000,
      strict_timeout: strictTimeout,
      allow_answer_reveal: allowAnswerReveal,
      scoring_mode: scoringMode,
      subjective_points: 10,
    };
    const created = createExamSessionSnapshot({
      examId: uuid(),
      blueprint,
      questions: selected,
      queueQuestionIds: frozenSet?.question_ids,
      random,
    });
    snapshot = created;
    phase = "active";
    questionIndex = 0;
    startActor(created);
    void persist(created);
  }

  function syncActor(): void {
    if (!actor) return;
    actorState = actor.getSnapshot();
    snapshot = actorState.context.session;
    overdue = Boolean(snapshot.overdue_at);
    if (actorState.value === "submitting" && !busy) void submitRows();
  }

  function send(event: Parameters<ExamSessionActor["send"]>[0]): void {
    actor?.send(event);
    syncActor();
  }

  function navigate(index: number): void {
    if (!snapshot) return;
    const bounded = Math.max(0, Math.min(index, snapshot.queue_question_ids.length - 1));
    questionIndex = bounded;
    send({ type: "NAVIGATE", questionId: snapshot.queue_question_ids[bounded], now: Date.now() });
  }

  function selectOption(optionId: string): void {
    if (!currentQuestion || !currentDraft || currentDraft.revealed || !snapshot) return;
    const multi = currentQuestion.type === "multiple" || currentQuestion.type === "indefinite";
    const selected = multi
      ? currentDraft.selected_option_ids.includes(optionId)
        ? currentDraft.selected_option_ids.filter((id) => id !== optionId)
        : [...currentDraft.selected_option_ids, optionId]
      : [optionId];
    send({ type: "ANSWER", questionId: currentQuestion.id, selectedOptionIds: selected, elapsedMs: currentDraft.elapsed_ms, now: Date.now() });
  }

  function answerText(value: string): void {
    if (!currentQuestion || !currentDraft) return;
    send({ type: "ANSWER", questionId: currentQuestion.id, answerText: value, elapsedMs: currentDraft.elapsed_ms, now: Date.now() });
  }

  async function submitRows(): Promise<void> {
    if (!snapshot || !controller.submitExamEvent || !controller.submitExamAttempt || busy) return;
    busy = true;
    error = "";
    try {
      const plan = buildExamSubmissionPlan(snapshot, activeQuestions, [...activeBlockIdsByQuestionId].map(([questionId, blockId]) => ({ questionId, blockId })));
      for (const attempt of plan.attempts) {
        if (snapshot.committed_question_ids.includes(attempt.question_id)) continue;
        await controller.submitExamAttempt(attempt);
        send({ type: "COMMIT_QUESTION", questionId: attempt.question_id, now: Date.now() });
      }
      const summary = buildExamSummaryEvent(snapshot, plan, "exam_submitted");
      await controller.submitExamEvent(summary);
      send({ type: "SUBMIT_COMPLETE", pendingManualScore: plan.pendingSubjectiveQuestionIds.length > 0, now: Date.now() });
      submittedSummary = scoreExam(snapshot, activeQuestions);
      phase = "result";
      if (plan.pendingSubjectiveQuestionIds.length === 0) await controller.removeExamSession?.(snapshot.exam_id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      error = message;
      send({ type: "SUBMIT_FAILED", message, now: Date.now() });
    } finally {
      busy = false;
    }
  }

  function setSubjectiveScore(questionId: string, value: string): void {
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > 100) return;
    send({ type: "SELF_SCORE", questionId, score, now: Date.now() });
  }

  async function finalizeManualScores(): Promise<void> {
    if (!snapshot || !controller.submitExamAttempt || !controller.submitExamEvent || busy) return;
    busy = true;
    try {
      const plan = buildExamSubmissionPlan(snapshot, activeQuestions, [...activeBlockIdsByQuestionId].map(([questionId, blockId]) => ({ questionId, blockId })));
      if (plan.pendingSubjectiveQuestionIds.length > 0) throw new Error("Every subjective question requires a score");
      for (const attempt of plan.attempts) {
        if (snapshot.committed_question_ids.includes(attempt.question_id)) continue;
        await controller.submitExamAttempt(attempt);
        send({ type: "COMMIT_QUESTION", questionId: attempt.question_id, now: Date.now() });
      }
      await controller.submitExamEvent(buildExamSummaryEvent(snapshot, plan, "exam_finalized"));
      send({ type: "FINALIZE", now: Date.now() });
      submittedSummary = plan.summary;
      await controller.removeExamSession?.(snapshot.exam_id);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  function exit(): void {
    onClose?.();
  }

  async function abandonExam(): Promise<void> {
    if (!snapshot || !controller.submitExamEvent) return;
    if (!globalThis.confirm(label("confirmAbandonExam", "Abandon this exam? Answers will not enter question statistics."))) return;
    busy = true;
    try {
      const plan = buildExamSubmissionPlan(snapshot, activeQuestions);
      await controller.submitExamEvent(buildExamSummaryEvent(snapshot, plan, "exam_abandoned"));
      send({ type: "ABANDON", now: Date.now() });
      await controller.removeExamSession?.(snapshot.exam_id);
      onClose?.();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  function rendered(markdown: string): string {
    return renderQuestionMarkdown?.(markdown, true) ?? markdown;
  }
</script>

{#if phase === "setup" && composerOpen}
  <QuestionSetComposer
    catalog={questionCatalog}
    documents={sourceDocuments}
    blueprints={questionSetBlueprints}
    {translations}
    loading={busy}
    onRefresh={() => { void loadQuestionSetData(); }}
    onSync={previewSourceSync}
    onConfirmSync={confirmSourceSync}
    onAssemble={assembleBlueprint}
    onSave={saveBlueprint}
    onDelete={removeBlueprint}
    onUse={(value) => { void useFrozenSet(value); }}
    onClose={() => composerOpen = false}
  />
{:else if phase === "setup"}
  <section class="exam-workspace exam-setup">
    <header class="exam-heading"><div><strong>{label("examMode", "Exam mode")}</strong><span>{sourceLabel}</span></div><Button variant="ghost" size="icon" onclick={onClose}><X /></Button></header>
    <div class="exam-form">
      <label>{label("questionCount", "Question count")}<Input type="number" min="1" max={activeQuestions.length} bind:value={questionCount} /></label>
      <label>{label("timeLimit", "Time limit (minutes)")}<Input type="number" min="0" bind:value={timeLimitMinutes} /></label>
      <Label>{label("order", "Order")}<Select.Root type="single" value={order} onValueChange={(value) => { if (value) order = value as typeof order; }}><Select.Trigger>{order === "random" ? label("random", "Random") : label("sequential", "Sequential")}</Select.Trigger><Select.Content><Select.Item value="sequential" label={label("sequential", "Sequential")} /><Select.Item value="random" label={label("random", "Random")} /></Select.Content></Select.Root></Label>
      <Label>{label("scoringMode", "Scoring")}<Select.Root type="single" value={scoringMode} onValueChange={(value) => { if (value) scoringMode = value as typeof scoringMode; }}><Select.Trigger>{scoringMode === "strict" ? label("strictScoring", "Strict one-point") : label("legalScoring", "Legal exam")}</Select.Trigger><Select.Content><Select.Item value="legal-exam" label={label("legalScoring", "Legal exam")} /><Select.Item value="strict" label={label("strictScoring", "Strict one-point")} /></Select.Content></Select.Root></Label>
      <Label class="exam-check"><Checkbox bind:checked={allowAnswerReveal} />{label("allowAnswerReveal", "Allow answer reveal")}</Label>
      <Label class="exam-check"><Checkbox bind:checked={strictTimeout} />{label("strictTimeout", "Strict timeout auto-submit")}</Label>
    </div>
    {#if frozenSet}<div class="rounded border px-3 py-2 text-sm"><strong>{frozenSetLabel}</strong><span class="ml-2 text-muted-foreground">{frozenSet.question_ids.length} {label("questions", "题")}</span></div>{/if}
    <div class="exam-actions">
      <Button onclick={startExam} disabled={activeQuestions.length === 0}><Send size={16} />{label("startExam", "Start exam")}</Button>
      <Button variant="outline" onclick={() => composerOpen = true}><Layers3 size={16} />{label("questionSet", "跨文档组卷")}</Button>
    </div>
  </section>
{:else if phase === "active" && snapshot && currentQuestion && currentDraft}
  <section class="exam-workspace exam-runner">
    <header class="exam-heading">
      <div><strong>{snapshot.blueprint.title}</strong><span>{questionIndex + 1} / {snapshot.queue_question_ids.length}</span></div>
      <div class:overdue><Clock3 size={16} />{remainingMs === undefined ? label("untimed", "Untimed") : remainingMs <= 0 ? label("overdue", "Overdue") : `${Math.ceil(remainingMs / 60000)} min`}</div>
      <Button variant="ghost" size="icon" onclick={exit} title={label("exitExam", "Exit and keep running")}><X /></Button>
    </header>
    <nav class="exam-question-nav" aria-label={label("questionNavigation", "Question navigation")}>
      {#each snapshot.queue_question_ids as id, index (id)}
        <Button variant={index === questionIndex ? "default" : "outline"} size="icon-sm" class={(snapshot.drafts[id].selected_option_ids.length > 0 || Boolean(snapshot.drafts[id].answer_text) ? "answered " : "") + (snapshot.drafts[id].marked ? "marked" : "")} onclick={() => navigate(index)}>{index + 1}</Button>
      {/each}
    </nav>
    <article class="exam-question">
      <div class="exam-question-toolbar"><span>{currentQuestion.type}</span><Button variant="ghost" size="icon" title={label("mark", "Mark for review")} aria-label={label("mark", "Mark for review")} class={currentDraft.marked ? "active" : ""} onclick={() => send({ type: "TOGGLE_MARK", questionId: currentQuestion.id, now: Date.now() })}><Flag size={16} /></Button></div>
      <div class="exam-stem">{@html rendered(currentQuestion.stemMarkdown)}</div>
      {#if currentQuestion.type === "subjective"}
        <Textarea value={currentDraft.answer_text ?? ""} oninput={(event) => answerText(event.currentTarget.value)} placeholder={label("subjectiveAnswer", "Write your answer")} />
      {:else}
        <div class="exam-options">
          {#each currentDraft.option_order as optionId (optionId)}
            {@const option = currentQuestion.options.find((candidate) => candidate.id === optionId)}
            {#if option}<Button variant={currentDraft.selected_option_ids.includes(option.id) ? "secondary" : "outline"} class="exam-option" onclick={() => selectOption(option.id)}>{@html rendered(option.markdown)}</Button>{/if}
          {/each}
        </div>
      {/if}
      {#if currentDraft.revealed}<div class="exam-solution">{@html rendered(currentQuestion.solutionMarkdown)}</div>{/if}
    </article>
    <footer class="exam-footer">
      <Button variant="destructive" onclick={abandonExam} disabled={busy}>{label("abandonExam", "Abandon")}</Button>
      <Button variant="outline" disabled={questionIndex === 0} onclick={() => navigate(questionIndex - 1)}><ChevronLeft size={16} />{label("previous", "Previous")}</Button>
      {#if allowAnswerReveal && !currentDraft.revealed}<Button variant="outline" onclick={() => send({ type: "REVEAL", questionId: currentQuestion.id, now: Date.now() })}>{label("reveal", "Reveal")}</Button>{/if}
      {#if questionIndex < snapshot.queue_question_ids.length - 1}<Button variant="outline" onclick={() => navigate(questionIndex + 1)}>{label("next", "Next")}<ChevronRight size={16} /></Button>{:else}<Button onclick={() => send({ type: "SUBMIT", now: Date.now() })} disabled={busy}><Check size={16} />{label("submitExam", "Submit exam")}</Button>{/if}
    </footer>
    {#if overdue}<div class="exam-overdue"><AlertTriangle size={16} />{label("examOverdueContinue", "Time limit reached. You may continue until you submit.")}</div>{/if}
    {#if error}<div class="exam-error" role="alert">{error}</div>{/if}
  </section>
{:else if phase === "result" && snapshot && submittedSummary}
  <section class="exam-workspace exam-results">
    <header class="exam-heading"><strong>{label("examResult", "Exam result")}</strong><Button variant="ghost" size="icon" onclick={onClose}><X /></Button></header>
    <div class="exam-score"><strong>{submittedSummary.percentage.toFixed(1)}%</strong><span>{submittedSummary.score.toFixed(1)} / {submittedSummary.maxScore.toFixed(1)}</span></div>
    <div class="exam-result-grid"><span>{label("correct", "Correct")}<strong>{submittedSummary.correctCount}</strong></span><span>{label("answered", "Answered")}<strong>{submittedSummary.answeredCount}</strong></span><span>{label("manualScorePending", "Manual score pending")}<strong>{submittedSummary.pendingManualCount}</strong></span></div>
    {#if submittedSummary.pendingManualCount > 0}
      <div class="exam-manual-score-list">
        {#each snapshot.queue_question_ids as questionId (questionId)}
          {@const question = activeQuestions.find((candidate) => candidate.id === questionId)}
          {#if question?.type === "subjective"}
            <label>{question.title}<Input type="number" min="0" max="100" value={snapshot.drafts[questionId].subjective_score ?? ""} oninput={(event) => setSubjectiveScore(questionId, event.currentTarget.value)} /></label>
          {/if}
        {/each}
        <Button onclick={finalizeManualScores} disabled={busy}>{label("finalizeExam", "Finalize exam")}</Button>
      </div>
    {/if}
  </section>
{/if}
