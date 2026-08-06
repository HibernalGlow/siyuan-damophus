<script lang="ts">
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import type { QuestionBankInitializationPreview, QuestionBankRebindingPreview } from "@/question-bank/adapters/siyuan";

  export let label: (key: string, fallback: string) => string;
  export let documentId = "";
  export let validDocument: () => boolean;
  export let busy = false;
  export let initializationPreview: QuestionBankInitializationPreview | undefined;
  export let previewInitialization: () => void;
  export let confirmInitialization: () => void;
  export let systemDocumentId = "";
  export let invalidateSystemDocumentTarget: () => void;
  export let rebindingPreview: QuestionBankRebindingPreview | undefined;
  export let previewRebinding: () => void;
  export let confirmRebinding: () => void;
  export let invalidateDocumentTarget: () => void;
</script>

<section class="setup min-h-0 flex-1 overflow-y-auto" aria-label={label("initialize", "Initialize")}>
  <FormLabel class="mb-2" for="document-id">{label("documentId", "Document ID")}</FormLabel>
  <div class="document-row">
    <Input id="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" oninput={invalidateDocumentTarget} />
    <Button disabled={!validDocument() || busy} onclick={previewInitialization}>{label("previewInitialization", "Preview initialization")}</Button>
  </div>
  {#if initializationPreview}
    <div class="preview-line">
      <span>{label("initializationReady", "System document and databases are ready to create")}</span>
      <code>{initializationPreview.path}</code>
      <Button disabled={busy} onclick={confirmInitialization}>{label("confirmInitialization", "Create system document")}</Button>
    </div>
  {/if}
  <div class="rebind-setup">
    <FormLabel class="mb-2" for="system-document-id">{label("systemDocumentId", "Existing Damophus system document ID")}</FormLabel>
    <div class="document-row">
      <Input id="system-document-id" name="system-document-id" bind:value={systemDocumentId} autocomplete="off" spellcheck="false" oninput={invalidateSystemDocumentTarget} />
      <Button variant="outline" disabled={!/^\d{14}-[a-z0-9]{7}$/u.test(systemDocumentId) || busy} onclick={previewRebinding}>{label("previewRebinding", "Preview reconnection")}</Button>
    </div>
    {#if rebindingPreview}
      <div class="preview-line">
        <span>{label("rebindingReady", "Question index and attempt log are ready to reconnect")}</span>
        {#if rebindingPreview.bindingRepairs.length > 0}<span>{rebindingPreview.bindingRepairs.length} {label("bindingRepairs", "Database repairs")}</span>{/if}
        <Button disabled={busy} onclick={confirmRebinding}>{label("confirmRebinding", "Reconnect")}</Button>
      </div>
    {/if}
  </div>
</section>
