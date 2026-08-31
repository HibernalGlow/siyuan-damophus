<script lang="ts">
  import { Check, Copy, Download, FileJson, Upload, X, XCircle } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Label } from "@/components/ui/label";
  import { Textarea } from "@/components/ui/textarea";

  export let label: (key: string, fallback: string) => string;
  export let open = false;
  export let mode: "export" | "import" = "export";
  export let exportContent = "";
  export let importError = "";
  export let onClose: () => void;
  export let onConfirmImport: (content: string, importMode: "append" | "overwrite") => void;

  let jsonContent = "";
  let copied = false;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let importMode: "append" | "overwrite" = "append";
  let fileInputRef: HTMLInputElement | null = null;

  $: if (open) {
    jsonContent = mode === "export" ? exportContent : "";
    copied = false;
    importMode = "append";
  }

  function t(key: string, fallback: string): string {
    return label(key, fallback);
  }

  async function copyContent() {
    const content = mode === "export" ? exportContent : jsonContent;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      const ta = document.createElement("textarea");
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    copied = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 2000);
  }

  function downloadContent() {
    const content = mode === "export" ? exportContent : jsonContent;
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `damophus-more-background-templates-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const reader = new FileReader();
    reader.onload = (load) => {
      jsonContent = (load.target?.result as string) || "";
    };
    reader.readAsText(files[0]);
  }
</script>

{#if open}
  <div class="mb-modal" role="dialog" aria-modal="true">
    <div class="mb-modal-panel">
      <header class="mb-modal-header">
        <span class="mb-modal-title">
          <span class="mb-icon-chip"><FileJson class="size-4" /></span>
          <span>{mode === "export"
            ? t("lets-more-background.exportJsonTitle", "导出预设模板 (JSON)")
            : t("lets-more-background.importJsonTitle", "导入预设模板 (JSON)")}</span>
        </span>
        <Button variant="ghost" size="icon-sm" class="size-7 text-muted-foreground hover:text-foreground" onclick={onClose} aria-label={t("lets-more-background.cancel", "取消")}>
          <X class="size-4" />
        </Button>
      </header>

      <div class="mb-modal-body">
        {#if mode === "export"}
          <p class="m-0 leading-relaxed text-muted-foreground">
            {t("lets-more-background.exportJsonHint", "以下是当前配置的全部条件模板 JSON 数据，可直接复制或下载为文件，用于备份或分享。")}
          </p>
          <Textarea readonly value={exportContent} class="h-64 font-mono text-xs leading-relaxed select-all" />
        {:else}
          <p class="m-0 leading-relaxed text-muted-foreground">
            {t("lets-more-background.importJsonHint", "可直接在下方文本框粘贴模板 JSON 代码，或上传 .json 文件。")}
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <input type="file" accept=".json,application/json" class="hidden" bind:this={fileInputRef} onchange={handleFileSelect} />
            <Button variant="outline" size="sm" class="gap-1.5" onclick={() => fileInputRef?.click()}>
              <Upload class="size-3.5" />
              <span>{t("lets-more-background.uploadJsonFile", "选择 JSON 文件上传")}</span>
            </Button>
            {#if fileInputRef?.files?.[0]}
              <span class="mb-mono mb-truncate max-w-xs text-xs text-muted-foreground">{fileInputRef.files[0].name}</span>
            {/if}
          </div>
          <div>
            <Label class="mb-field-label">{t("lets-more-background.jsonContentLabel", "JSON 数据内容")}</Label>
            <Textarea
              bind:value={jsonContent}
              placeholder={t("lets-more-background.jsonPastePlaceholder", "在此粘贴 JSON 文本（支持单个模板对象、模板数组或完整导出包）...")}
              class="h-48 font-mono text-xs leading-relaxed"
            />
          </div>
          <div class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2.5 sm:flex-row sm:items-center">
            <span class="text-xs font-medium">{t("lets-more-background.importModeLabel", "导入方式")}</span>
            <label class="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="radio" name="mb-import-mode" value="append" checked={importMode === "append"} onchange={() => (importMode = "append")} />
              <span>{t("lets-more-background.importModeAppend", "追加到现有模板后面")}</span>
            </label>
            <label class="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="radio" name="mb-import-mode" value="overwrite" checked={importMode === "overwrite"} onchange={() => (importMode = "overwrite")} />
              <span class="font-medium text-destructive">{t("lets-more-background.importModeOverwrite", "覆盖所有现有模板")}</span>
            </label>
          </div>
          {#if importError}
            <div class="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
              <XCircle class="size-4 shrink-0" />
              <span>{importError}</span>
            </div>
          {/if}
        {/if}
      </div>

      <footer class="mb-modal-footer">
        <Button variant="ghost" size="sm" onclick={onClose}>{t("lets-more-background.cancel", "取消")}</Button>
        <div class="mb-modal-footer-actions">
          {#if mode === "export"}
            <Button variant="outline" size="sm" class="gap-1.5" onclick={downloadContent}>
              <Download class="size-3.5" />
              <span>{t("lets-more-background.downloadJsonFile", "下载 JSON 文件")}</span>
            </Button>
            <Button variant="secondary" size="sm" class="gap-1.5 font-medium" onclick={copyContent}>
              {#if copied}
                <Check class="size-3.5 text-emerald-500" />
                <span class="text-emerald-500">{t("lets-more-background.copiedToClipboard", "已复制")}</span>
              {:else}
                <Copy class="size-3.5" />
                <span>{t("lets-more-background.copyJson", "复制 JSON")}</span>
              {/if}
            </Button>
          {:else}
            <Button variant="secondary" size="sm" class="gap-1.5 font-medium" disabled={!jsonContent.trim()} onclick={() => onConfirmImport(jsonContent, importMode)}>
              <Check class="size-3.5" />
              <span>{t("lets-more-background.confirmImport", "确认导入")}</span>
            </Button>
          {/if}
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* Import errors surface inline next to the mode selector via the parent. */
</style>
