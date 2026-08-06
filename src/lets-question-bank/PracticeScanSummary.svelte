<script lang="ts">
  import { Button, buttonVariants } from "@/components/ui/button";
  import * as Collapsible from "@/components/ui/collapsible";
  import { Badge } from "@/components/ui/badge";
  import * as Progress from "@/components/ui/progress";
  import { Switch } from "@/components/ui/switch";
  import { Label as FormLabel } from "@/components/ui/label";
  import type { QuestionIndexPreview } from "@/question-bank/application";
  import type { ScanMessage } from "@/question-bank/core/types";
  import type { SourceBlockIdentity } from "./controller";

  type Label = (key: string, fallback: string) => string;
  type ScanMessageGroup = { key: string; messages: ScanMessage[] };

  export let label: Label;
  export let preview: QuestionIndexPreview;
  export let sourceIdentity: SourceBlockIdentity | undefined = undefined;
  export let progressQuestionCount = 0;
  export let completionPercent = 0;
  export let attemptedQuestions = 0;
  export let untouchedQuestions = 0;
  export let reviewQuestions = 0;
  export let pendingSync = false;
  export let busy = false;
  export let syncComplete = false;
  export let autoSyncIndex = false;
  export let scanDetailsOpen = false;
  export let scanMessageGroups: ScanMessageGroup[] = [];
  export let sourceTypeLabel: (type: string) => string;
  export let completionStatusLabel: (attempted: number, total: number) => string;
  export let messageContext: (message: ScanMessage) => string;
  export let messageClipboardText: (message: ScanMessage) => string;
  export let scanLogText: () => string;
  export let copyText: (value: string) => void | Promise<void>;
  export let confirmSync: () => void;
  export let toggleAutoSyncIndex: (checked: boolean) => void;
</script>

<section class="scan-summary" aria-label={label("scanSummary", "Scan summary")}>
  <div class="source-progress-overview">
    {#if sourceIdentity}
      <div class="source-identity" data-testid="source-identity">
        <div class="source-heading">
          <Badge variant="outline">{sourceTypeLabel(sourceIdentity.type)}</Badge>
          <strong>{sourceIdentity.content}</strong>
        </div>
        {#if sourceIdentity.hpath}<span>{sourceIdentity.hpath}</span>{/if}
        <code>{sourceIdentity.id}</code>
      </div>
    {/if}
    <div class="completion-overview" data-testid="completion-overview">
      <div class="completion-heading">
        <span>{label("completion", "Completion")}</span>
        <Badge variant={completionPercent === 100 ? "default" : attemptedQuestions > 0 ? "secondary" : "outline"}>
          {completionStatusLabel(attemptedQuestions, progressQuestionCount)}
        </Badge>
        <strong>{completionPercent}%</strong>
      </div>
      <Progress.Root class="h-2" value={completionPercent} max={100} aria-label={label("completionProgress", "Question completion progress")} />
      <div class="progress-stats">
        <span><strong>{progressQuestionCount}</strong>{label("questions", "Questions")}</span>
        <span><strong>{attemptedQuestions}</strong>{label("attempted", "Attempted")}</span>
        <span><strong>{untouchedQuestions}</strong>{label("untouched", "Untouched")}</span>
        <span><strong>{reviewQuestions}</strong>{label("needsReview", "Needs review")}</span>
      </div>
    </div>
  </div>
  <div class="summary-grid">
    <span><strong>{preview.actions.filter((action) => action.kind === "add").length}</strong>{label("additions", "Additions")}</span>
    <span><strong>{preview.actions.filter((action) => action.kind === "update").length}</strong>{label("updates", "Updates")}</span>
    <span><strong>{preview.scan.report.inferences.length}</strong>{label("inferences", "Inferences")}</span>
    <span><strong>{preview.scan.report.issues.length}</strong>{label("issues", "Issues")}</span>
    <span class:danger={preview.blockers.length > 0}><strong>{preview.blockers.length}</strong>{label("blockers", "Blockers")}</span>
  </div>
  <Button variant={pendingSync ? "default" : "outline"} disabled={busy || preview.blockers.length > 0 || !pendingSync} onclick={confirmSync}>
    <svg data-icon="inline-start" aria-hidden="true"><use href="#iconCheck"></use></svg>
    {pendingSync ? label("confirmSync", "Confirm index sync") : label("indexCurrent", "Index is up to date")}
  </Button>
  <FormLabel class="auto-sync-toggle cursor-pointer gap-2" for="auto-sync-index-toggle">
    <Switch id="auto-sync-index-toggle" size="sm" checked={autoSyncIndex} onCheckedChange={toggleAutoSyncIndex} aria-label={label("autoSyncIndex", "Automatically sync latest index")} />
    <span>{label("autoSyncIndex", "Automatically sync latest index")}</span>
  </FormLabel>
  {#if pendingSync}
    <span class="text-sm font-medium text-primary">{preview.blockers.length > 0 ? label("syncBlocked", "Index changes detected; resolve blockers before syncing") : label("syncRequired", "Index changes detected; synchronization is required")}</span>
  {:else}
    <span class="text-sm text-muted-foreground">{syncComplete ? label("synced", "Question index synchronized") : label("indexCurrent", "Index is up to date")}</span>
  {/if}
  <Collapsible.Root bind:open={scanDetailsOpen} class="basis-full border-t border-border pt-2.5 select-text">
    <Collapsible.Trigger class={buttonVariants({ variant: "ghost", size: "sm" })}>
      <svg data-icon="inline-start" aria-hidden="true"><use href={scanDetailsOpen ? "#iconUp" : "#iconDown"}></use></svg>
      {label("scanDetails", "Scan details")}
    </Collapsible.Trigger>
    <Collapsible.Content>
      <div class="scan-detail-actions">
        <span>{label("inferenceNotice", "Inferences describe detected structure and are not errors.")}</span>
        {#if scanMessageGroups.some((group) => group.messages.length > 0)}
          <Button variant="outline" size="sm" type="button" onclick={() => void copyText(scanLogText())}>
            <svg data-icon="inline-start" aria-hidden="true"><use href="#iconCopy"></use></svg>
            {label("copyScanLog", "Copy scan log")}
          </Button>
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
                    <div><code>{message.code}</code><span>{message.message}</span></div>
                    <Button variant="ghost" size="icon-sm" type="button" aria-label={label("copyFinding", "Copy finding")} title={label("copyFinding", "Copy finding")} onclick={() => void copyText(messageClipboardText(message))}>
                      <svg aria-hidden="true"><use href="#iconCopy"></use></svg>
                    </Button>
                  </div>
                  {#if message.title}<strong class="message-title">{label("heading", "Heading")}: {message.title}</strong>{/if}
                  {#if messageContext(message)}<small>{messageContext(message)}</small>{/if}
                  {#if message.sourceMarkdown}
                    <Collapsible.Root class="message-source mt-1.5">
                      <Collapsible.Trigger class={buttonVariants({ variant: "ghost", size: "xs" })}>{label("sourceMarkdown", "Original Markdown")}</Collapsible.Trigger>
                      <Collapsible.Content><pre class="mt-1.5 mb-0 max-h-45 overflow-auto rounded-md border border-border bg-background p-2 whitespace-pre-wrap break-words"><code class="text-xs select-text">{message.sourceMarkdown}</code></pre></Collapsible.Content>
                    </Collapsible.Root>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/each}
      {#if preview.ialWriteActions.length > 0}
        <div class="report-group"><strong>{label("ialUpdates", "IAL updates")}</strong><ul>{#each preview.ialWriteActions as action}<li><code>{action.reason}</code><span>{action.questionId}: {JSON.stringify(action.attributes)}</span><small>{action.blockId}</small></li>{/each}</ul></div>
      {/if}
      {#if preview.bindingRepairs.length > 0}
        <div class="report-group"><strong>{label("bindingRepairs", "Database repairs")}</strong><ul>{#each preview.bindingRepairs as repair}<li><code>{repair.database}</code><span>{String(repair.field)} ({repair.currentType ? `${repair.currentType} -> ` : ""}{repair.type})</span></li>{/each}</ul></div>
      {/if}
      {#if preview.staleQuestionIds.length > 0}<div class="report-group"><strong>{label("staleQuestions", "Stale questions")}</strong><code>{preview.staleQuestionIds.join(", ")}</code></div>{/if}
    </Collapsible.Content>
  </Collapsible.Root>
</section>

<style>
  .scan-summary { padding: 16px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .source-progress-overview { flex-basis: 100%; min-width: 0; display: grid; grid-template-columns: minmax(240px, 1fr) minmax(360px, 1.15fr); gap: 24px; align-items: stretch; }
  .source-identity, .completion-overview { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
  .source-heading { min-width: 0; display: flex; align-items: center; gap: 8px; }
  .source-heading strong { min-width: 0; font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
  .source-identity > span { color: var(--b3-theme-on-surface); font-size: 12px; overflow-wrap: anywhere; }
  .source-identity > code { width: fit-content; max-width: 100%; color: var(--b3-theme-on-surface); font-size: 11px; overflow-wrap: anywhere; }
  .completion-heading { min-width: 0; display: grid; grid-template-columns: auto auto minmax(44px, 1fr); align-items: center; gap: 8px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .completion-heading strong { justify-self: end; color: var(--b3-theme-on-background); font-size: 18px; font-variant-numeric: tabular-nums; }
  .progress-stats { display: grid; grid-template-columns: repeat(4, minmax(58px, 1fr)); }
  .progress-stats span { min-width: 0; padding: 2px 9px; border-left: 1px solid var(--b3-border-color); display: flex; flex-direction: column; color: var(--b3-theme-on-surface); font-size: 11px; }
  .progress-stats span:first-child { padding-left: 0; border-left: 0; }
  .progress-stats strong { color: var(--b3-theme-on-background); font-size: 15px; font-variant-numeric: tabular-nums; }
  .summary-grid { flex: 1; display: grid; grid-template-columns: repeat(5, minmax(74px, 1fr)); gap: 1px; background: var(--b3-border-color); }
  .summary-grid span { min-height: 52px; padding: 7px 9px; background: var(--b3-theme-surface); display: flex; flex-direction: column; justify-content: center; font-size: 12px; color: var(--b3-theme-on-surface); }
  .summary-grid strong { color: var(--b3-theme-on-background); font-size: 17px; }
  .summary-grid .danger strong { color: var(--b3-theme-error); }
  .scan-detail-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .report-group { margin-top: 12px; }
  .report-group > strong { display: block; margin-bottom: 6px; font-size: 13px; }
  .report-group ul { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  .report-group li { min-width: 0; }
  .report-message-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .report-message-heading > div { min-width: 0; }
  .report-message-heading span { margin-left: 8px; overflow-wrap: anywhere; }
  .message-title { display: block; margin-top: 5px; overflow-wrap: anywhere; }
  .report-group small { display: block; margin-top: 2px; color: var(--b3-theme-on-surface); overflow-wrap: anywhere; }

  @container (max-width: 960px) {
    .source-progress-overview { grid-template-columns: 1fr; gap: 18px; }
    .summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); flex-basis: 100%; }
    .summary-grid span { min-height: 46px; padding: 5px 4px; text-align: center; }
    .summary-grid strong { font-size: 15px; }
  }

  @container (max-width: 760px) {
    .scan-summary { gap: 10px; }
    .source-progress-overview { gap: 12px; }
    .progress-stats span { padding-inline: 5px; text-align: center; }
    .progress-stats strong { font-size: 14px; }
    :global(.auto-sync-toggle > span) { display: none; }
  }

  @container (max-width: 430px) {
    .source-identity > span, .source-identity > code { display: none; }
    .completion-overview { gap: 6px; }
    .summary-grid span { min-height: 40px; font-size: 10px; }
  }

  @container (max-height: 620px) {
    .source-identity > span, .source-identity > code { display: none; }
    .completion-overview { gap: 6px; }
    .summary-grid span { min-height: 40px; font-size: 10px; }
  }
</style>
