<script lang="ts">
  import { Database, Download, RefreshCw, ScanLine, Upload } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import type { ScanMessage, TopicNode } from "@/question-bank/core/types";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import type { PracticeOptionOrder, PracticeOrder } from "@/question-bank/application";
  import type { QuestionIndexPreview } from "@/question-bank/application";
  import type { TopicRelationPreview, TopicRelationSyncMode } from "@/question-bank/adapters/siyuan";
  import type { SourceBlockIdentity } from "./controller";
  import type { StoredPracticeSession } from "./session-host";
  import PracticeScanSummary from "./PracticeScanSummary.svelte";
  import PracticeLauncher from "./PracticeLauncher.svelte";
  import AnswerModeSwitcher, { type AnswerMode } from "./AnswerModeSwitcher.svelte";
  import ExamWorkspace from "./ExamWorkspace.svelte";
  import QuestionSetComposer from "./QuestionSetComposer.svelte";
  import QuestionBankPanel from "./QuestionBankPanel.svelte";

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
  export let topicAssignmentCount = 0;
  export let topicRelationMode: "off" | TopicRelationSyncMode = "off";
  export let topicRelationPreview: TopicRelationPreview | undefined = undefined;
  export let topicRelationReady = false;
  export let setTopicRelationMode: (mode: "off" | TopicRelationSyncMode) => void;
  export let previewTopicRelations: () => void;
  export let confirmTopicRelations: () => void;
  export let recoverableSession: any;
  export let resumePractice: () => void;
  export let pendingReplacement = false;
  export let confirmRestartPractice: () => void;
  export let topicId = "";
  export let topics: TopicNode[] = [];
  export let order: PracticeOrder = "sequential";
  export let optionOrder: PracticeOptionOrder = "random";
  export let filter: PracticeFilter = "all";
  export let startPractice: () => void;
  export let openQuestionSetComposer: () => void;
  export let composerOpen = false;
  export let examMode = false;
  export let translations: Record<string, string> = {};
  export let questionCatalog: any[] = [];
  export let sourceDocuments: any[] = [];
  export let questionSetBlueprints: any[] = [];
  export let run: (operation: () => Promise<void>) => void;
  export let loadQuestionSetData: () => Promise<void>;
  export let previewSourceSync: (documentIds: readonly string[]) => Promise<any>;
  export let confirmSourceSync: (value: any) => Promise<any>;
  export let assembleBlueprint: (value: any) => any;
  export let saveBlueprint: (value: any) => Promise<void>;
  export let removeBlueprint: (value: string) => Promise<void>;
  export let useFrozenPracticeSet: (value: any) => Promise<void>;
  export let controller: any;
  export let examQuestions: any[] = [];
  export let uuid: () => string;
  export let random: () => number;
  export let renderQuestionMarkdown: any;
  export let refreshStoredSessions: () => Promise<void>;

  let answerMode: AnswerMode = "practice";
  $: answerMode = composerOpen ? "composer" : examMode ? "exam" : "practice";

  function selectAnswerMode(mode: AnswerMode): void {
    if (mode === "composer") {
      examMode = false;
      openQuestionSetComposer();
      return;
    }
    composerOpen = false;
    examMode = mode === "exam";
  }

  function closeInlineMode(): void {
    composerOpen = false;
    examMode = false;
    void refreshStoredSessions();
  }
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

  <AnswerModeSwitcher {label} mode={answerMode} onSelect={selectAnswerMode} />

  {#if answerMode === "practice" && preview}
    <PracticeLauncher
      {label}
      {preview}
      {sourceIdentity}
      progressQuestionCount={progressQuestions.length}
      {attemptedQuestions}
      {untouchedQuestions}
      {reviewQuestions}
      {syncComplete}
      {busy}
      {recoverableSession}
      {resumePractice}
      bind:pendingReplacement
      {confirmRestartPractice}
      bind:topicId
      {topics}
      bind:order
      bind:optionOrder
      bind:filter
      {startPractice}
    />
  {:else if answerMode === "composer"}
    <div class="answer-mode-content" data-answer-mode="composer">
      <QuestionSetComposer
        embedded
        catalog={questionCatalog}
        documents={sourceDocuments}
        blueprints={questionSetBlueprints}
        {translations}
        loading={busy}
        onRefresh={() => { void run(loadQuestionSetData); }}
        onSync={previewSourceSync}
        onConfirmSync={confirmSourceSync}
        onAssemble={assembleBlueprint}
        onSave={saveBlueprint}
        onDelete={removeBlueprint}
        onUse={(value) => { void run(() => useFrozenPracticeSet(value)); }}
        onClose={closeInlineMode}
      />
    </div>
  {:else if answerMode === "exam"}
    <div class="answer-mode-content" data-answer-mode="exam">
      <ExamWorkspace
        embedded
        {controller}
        questions={examQuestions}
        blockIdsByQuestionId={preview?.scan.blockIdsByQuestionId ?? new Map()}
        sourceKey={documentId}
        sourceLabel={sourceIdentity?.content ?? documentId}
        {translations}
        {uuid}
        {random}
        {renderQuestionMarkdown}
        onClose={closeInlineMode}
      />
    </div>
  {/if}

  <section class="workspace-maintenance" aria-labelledby="workspace-maintenance-heading">
    <div class="workspace-maintenance-heading">
      <strong id="workspace-maintenance-heading">{label("preparationAndMaintenance", "准备与维护")}</strong>
      <span>{label("preparationAndMaintenanceDescription", "扫描、索引和作答数据不会挡住日常答题入口")}</span>
    </div>

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
      {topicAssignmentCount}
      {topicRelationMode}
      {topicRelationPreview}
      {topicRelationReady}
      {setTopicRelationMode}
      {previewTopicRelations}
      {confirmTopicRelations}
      {label}
    />
    </QuestionBankPanel>

  {/if}
  </section>
</section>
