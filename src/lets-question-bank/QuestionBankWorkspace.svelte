<script lang="ts">
  import { BookOpenCheck, CircleX, Clock3, Database, Download, Layers3, List, ListOrdered, RefreshCw, RotateCcw, ScanLine, Shuffle, Upload } from "lucide-svelte";
  import * as Alert from "@/components/ui/alert";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import * as Select from "@/components/ui/select";
  import * as ToggleGroup from "@/components/ui/toggle-group";
  import type { ScanMessage, TopicNode } from "@/question-bank/core/types";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import type { PracticeOrder } from "@/question-bank/application";
  import type { QuestionIndexPreview } from "@/question-bank/application";
  import type { SourceBlockIdentity } from "./controller";
  import type { StoredPracticeSession } from "./session-host";
  import PracticeScanSummary from "./PracticeScanSummary.svelte";
  import QuestionBankPanel from "./QuestionBankPanel.svelte";
  import { topicLabel } from "./question-bank-display";

  export let label: (key: string, fallback: string) => string;
  export let documentId = "";
  export let validDocument: () => boolean;
  export let invalidateDocumentTarget: () => void;
  export let busy = false;
  export let preview: QuestionIndexPreview | undefined;
  export let scanDocument: (reveal?: boolean) => void;
  export let autoScanDocument = false;
  export let toggleAutoScanDocument: (checked: boolean) => void;
  export let storedSessions: StoredPracticeSession[] = [];
  export let openStoredSession: (stored: StoredPracticeSession) => void;
  export let exportSessionDiagnostic: (sourceKey: string) => void;
  export let dataPanelOpen = false;
  export let dataPanelUserControlled = false;
  export let fileInput: HTMLInputElement | null = null;
  export let exportAttempts: () => void;
  export let selectImportFile: (event: Event) => void;
  export let importPreview: any;
  export let confirmImport: () => void;
  export let importResult: any;
  export let scanPanelOpen = false;
  export let scanPanelUserControlled = false;
  export let progressQuestions: any[] = [];
  export let sourceIdentity: SourceBlockIdentity | undefined;
  export let completionPercent = 0;
  export let attemptedQuestions = 0;
  export let untouchedQuestions = 0;
  export let reviewQuestions = 0;
  export let pendingSync = false;
  export let syncComplete = false;
  export let autoSyncIndex = false;
  export let scanDetailsOpen = false;
  export let scanMessageGroups: Array<{ key: string; messages: ScanMessage[] }> = [];
  export let sourceTypeLabel: (type: string) => string;
  export let completionStatusLabel: (attempted: number, total: number) => string;
  export let messageContext: (message: ScanMessage) => string;
  export let messageClipboardText: (message: ScanMessage) => string;
  export let scanLogText: () => string;
  export let copyText: (value: string) => Promise<void>;
  export let confirmSync: () => void;
  export let toggleAutoSyncIndex: (checked: boolean) => void;
  export let recoverableSession: any;
  export let resumePractice: () => void;
  export let pendingReplacement = false;
  export let confirmRestartPractice: () => void;
  export let topicId = "";
  export let topics: TopicNode[] = [];
  export let order: PracticeOrder = "sequential";
  export let filter: PracticeFilter = "all";
  export let startPractice: () => void;
  export let openQuestionSetComposer: () => void;
  export let examMode = false;
  const entireDocumentScope = "__damophus_entire_document__";
</script>

<section class="workspace min-h-0 flex-1 overflow-y-auto">
  <div class="workspace-toolbar">
    <div class="document-row">
      <FormLabel class="document-id-label" for="document-id">{label("documentId", "Document ID")}</FormLabel>
      <Input id="document-id" name="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" oninput={invalidateDocumentTarget} />
      <Button variant="outline" size="icon" title={label("scan", "Scan document")} aria-label={label("scan", "Scan document")} disabled={!validDocument() || busy} onclick={() => scanDocument(true)}>
        <ScanLine aria-hidden="true" />
      </Button>
      <Button
        variant={autoScanDocument ? "secondary" : "ghost"}
        size="icon"
        class="auto-scan-button"
        title={label("autoScanDocument", "Automatically scan document")}
        aria-label={label("autoScanDocument", "Automatically scan document")}
        aria-pressed={autoScanDocument}
        data-auto-scan-toggle
        onclick={() => toggleAutoScanDocument(!autoScanDocument)}
      >
        <RefreshCw aria-hidden="true" />
      </Button>
    </div>
  </div>
    {#if storedSessions.length > 0}
    <section class="unfinished-sessions" aria-label={label("unfinishedSessions", "Unfinished sessions")}>
      <div class="section-heading">
        <strong>{label("unfinishedSessions", "Unfinished sessions")}</strong>
        <Badge variant="secondary">{storedSessions.length}</Badge>
      </div>
      <div class="unfinished-list">
        {#each storedSessions as stored (stored.sourceKey)}
          <div class="unfinished-row">
            {#if stored.result.status === "ok"}
              <div>
                <strong>{stored.result.snapshot.source_label ?? stored.sourceKey}</strong>
                <span>{stored.result.snapshot.completed_question_ids.length} / {stored.result.snapshot.queue_question_ids.length}</span>
                <small>{new Date(stored.result.snapshot.updated_at).toLocaleString()}</small>
              </div>
              <Button variant="outline" size="sm" onclick={() => openStoredSession(stored)}>
                {label("openSession", "Open")}
              </Button>
            {:else}
              <div>
                <strong>{stored.sourceKey}</strong>
                <span>{stored.result.status === "unsupported"
                  ? `${label("unsupportedSession", "Unsupported session version")} ${stored.result.schemaVersion}`
                  : label("invalidSession", "Invalid saved session")}</span>
              </div>
              <Button variant="outline" size="sm" onclick={() => exportSessionDiagnostic(stored.sourceKey)}>
                {label("exportDiagnostic", "Export diagnostic")}
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
    {/if}

  <QuestionBankPanel
    bind:open={dataPanelOpen}
    Icon={Database}
    title={label("attemptData", "Attempt data")}
    description={`${label("exportAttempts", "Export attempts")} · ${label("importAttempts", "Import attempts")}`}
    className="data-panel"
    on:trigger={() => (dataPanelUserControlled = true)}
  >
      <div class="recovery-actions">
        <Button variant="outline" disabled={busy} onclick={exportAttempts}>
          <Download data-icon="inline-start" aria-hidden="true" />
          {label("exportAttempts", "Export attempts")}
        </Button>
        <Button variant="outline" disabled={busy} onclick={() => fileInput?.click()}>
          <Upload data-icon="inline-start" aria-hidden="true" />
          {label("importAttempts", "Import attempts")}
        </Button>
        <Input data-import-file class="hidden" bind:ref={fileInput} type="file" accept="application/json,.json" onchange={selectImportFile} />
      </div>
  {#if importPreview}
    <section class="import-report" aria-label={label("importPreview", "Import preview")}>
      <span><strong>{importPreview.importable}</strong>{label("importable", "Importable")}</span>
      <span><strong>{importPreview.duplicateAttemptIds.length}</strong>{label("duplicates", "Duplicates")}</span>
      <span><strong>{importPreview.orphanQuestionIds.length}</strong>{label("orphans", "Orphans")}</span>
      <Button disabled={busy} onclick={confirmImport}>{label("confirmImport", "Confirm import")}</Button>
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
  </QuestionBankPanel>

  {#if preview}
    <QuestionBankPanel
      bind:open={scanPanelOpen}
      Icon={ScanLine}
      title={label("scanSummary", "Scan summary")}
      description={`${progressQuestions.length} ${label("questions", "questions")} · ${preview.scan.report.issues.length} ${label("issues", "issues")}`}
      className="scan-panel"
      on:trigger={() => (scanPanelUserControlled = true)}
    >
      <svelte:fragment slot="meta">
          {#if preview.blockers.length > 0}<Badge variant="destructive">{preview.blockers.length}</Badge>{/if}
      </svelte:fragment>
    <PracticeScanSummary
      {preview}
      {sourceIdentity}
      progressQuestionCount={progressQuestions.length}
      {completionPercent}
      {attemptedQuestions}
      {untouchedQuestions}
      {reviewQuestions}
      {pendingSync}
      {busy}
      {syncComplete}
      {autoSyncIndex}
      bind:scanDetailsOpen
      {scanMessageGroups}
      {sourceTypeLabel}
      {completionStatusLabel}
      {messageContext}
      {messageClipboardText}
      {scanLogText}
      {copyText}
      {confirmSync}
      {toggleAutoSyncIndex}
      {label}
    />
    </QuestionBankPanel>

    <section class="practice-section" aria-labelledby="practice-settings-heading">
      <div class="practice-section-heading">
        <BookOpenCheck aria-hidden="true" />
        <div>
          <h2 id="practice-settings-heading">{label("practice", "Practice")}</h2>
          <span>{label("scope", "Scope")} · {label("order", "Order")} · {label("filter", "Filter")}</span>
        </div>
      </div>
    <section class="practice-settings">
      {#if recoverableSession}
        <div class="session-recovery">
          <div>
            <strong>{label("unfinishedFound", "Unfinished practice found")}</strong>
            <span>{recoverableSession.completed_question_ids.length} / {recoverableSession.queue_question_ids.length}</span>
          </div>
          <div class="session-recovery-actions">
            <Button onclick={() => resumePractice()}>{label("continue", "Continue")}</Button>
            <Button variant="outline" onclick={() => pendingReplacement = true}>{label("newSettings", "Use current settings")}</Button>
          </div>
        </div>
      {/if}

      {#if pendingReplacement && recoverableSession}
        <Alert.Root variant="destructive" class="col-span-full w-auto">
          <Alert.Title>{label("replaceSession", "Replace unfinished practice?")}</Alert.Title>
          <Alert.Description>{label("replaceSessionDescription", "Draft progress will be removed. Submitted attempts are preserved.")}</Alert.Description>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" onclick={confirmRestartPractice}>{label("confirmRestart", "Replace and start")}</Button>
            <Button variant="outline" size="sm" onclick={() => pendingReplacement = false}>{label("cancel", "Cancel")}</Button>
          </div>
        </Alert.Root>
      {/if}

      <div class="scope-control grid gap-2">
        <FormLabel>{label("scope", "Scope")}</FormLabel>
        <Select.Root
          type="single"
          value={topicId || entireDocumentScope}
          onValueChange={(value) => topicId = value === entireDocumentScope ? "" : value}
        >
          <Select.Trigger class="w-full">
            {topicId ? topicLabel(topics.find((topic) => topic.id === topicId) ?? topics[0]) : label("entireDocument", "Entire document")}
          </Select.Trigger>
          <Select.Content>
            <Select.Group>
              <Select.Item value={entireDocumentScope} label={label("entireDocument", "Entire document")} />
              {#each topics as topic (topic.id)}
                <Select.Item value={topic.id} label={topicLabel(topic)} />
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>

      <fieldset class="order-control">
        <legend>{label("order", "Order")}</legend>
        <ToggleGroup.Root
          type="single"
          variant="outline"
          class="grid w-full grid-cols-2"
          value={order}
          onValueChange={(value) => { if (value) order = value as PracticeOrder; }}
        >
          <ToggleGroup.Item value="sequential" title={label("sequential", "Sequential")} aria-label={label("sequential", "Sequential")}>
            <ListOrdered aria-hidden="true" />
            <span class="control-copy">{label("sequential", "Sequential")}</span>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="random" title={label("random", "Random")} aria-label={label("random", "Random")}>
            <Shuffle aria-hidden="true" />
            <span class="control-copy">{label("random", "Random")}</span>
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </fieldset>

      <fieldset class="filter-control">
        <legend>{label("filter", "Filter")}</legend>
        <ToggleGroup.Root
          type="single"
          variant="outline"
          class="grid w-full grid-cols-4 max-[520px]:grid-cols-2"
          value={filter}
          onValueChange={(value) => { if (value) filter = value as PracticeFilter; }}
        >
          <ToggleGroup.Item value="all" title={label("all", "All")} aria-label={label("all", "All")}>
            <List aria-hidden="true" />
            <span class="control-copy">{label("all", "All")}</span>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="wrong" title={label("wrong", "Wrong")} aria-label={label("wrong", "Wrong")}>
            <CircleX aria-hidden="true" />
            <span class="control-copy">{label("wrong", "Wrong")}</span>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="review" title={label("review", "Review")} aria-label={label("review", "Review")}>
            <RotateCcw aria-hidden="true" />
            <span class="control-copy">{label("review", "Review")}</span>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="due" title={label("due", "Due")} aria-label={label("due", "Due")}>
            <Clock3 aria-hidden="true" />
            <span class="control-copy">{label("due", "Due")}</span>
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </fieldset>

      <Button
        class="start max-[760px]:w-full"
        disabled={busy || preview.blockers.length > 0 || preview.bindingRepairs.length > 0 || (!syncComplete && preview.actions.some((action) => action.kind === "add"))}
        onclick={startPractice}
      >
        <BookOpenCheck data-icon="inline-start" aria-hidden="true" />
        <span>{label("start", "Start practice")}</span>
      </Button>
      <Button
        class="max-[760px]:w-full"
        variant="outline"
        disabled={busy}
        onclick={openQuestionSetComposer}
      >
        <Layers3 data-icon="inline-start" aria-hidden="true" />
        <span>{label("questionSet", "跨文档组卷")}</span>
      </Button>
      <Button
        class="max-[760px]:w-full"
        variant="outline"
        disabled={busy || preview.blockers.length > 0 || preview.bindingRepairs.length > 0 || (!syncComplete && preview.actions.some((action) => action.kind === "add"))}
        onclick={() => examMode = true}
      >
        <Clock3 data-icon="inline-start" aria-hidden="true" />
        <span>{label("startExam", "Start exam")}</span>
      </Button>
    </section>
    </section>
  {/if}
</section>
