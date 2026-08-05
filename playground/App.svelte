<script lang="ts">
  import { Languages, Moon, Monitor, RotateCcw, Smartphone, Sun } from "lucide-svelte";
  import QuestionBank from "@/lets-question-bank/question-bank.svelte";
  import { en, zhCN } from "@/translations/parts/lets-question-bank";
  import NativeIconDefinitions from "./NativeIconDefinitions.svelte";
  import { DevQuestionBankController, devDocumentId } from "./mock-question-bank";

  type ViewMode = "desktop" | "mobile";
  type ColorMode = "light" | "dark";

  let viewMode: ViewMode = "desktop";
  let colorMode: ColorMode = "light";
  let locale: "zh-CN" | "en" = "zh-CN";
  let revision = 0;
  let controller = new DevQuestionBankController();
  let sourceNotice = "";

  $: translations = locale === "zh-CN" ? zhCN : en;

  function reset(): void {
    controller = new DevQuestionBankController();
    sourceNotice = "";
    revision += 1;
  }

  function openQuestionSource(blockId: string): void {
    sourceNotice = locale === "zh-CN"
      ? `模拟打开思源块：${blockId}`
      : `Mock SiYuan block: ${blockId}`;
  }
</script>

<NativeIconDefinitions />

<main class="dev-shell" data-color-mode={colorMode}>
  <header class="dev-toolbar">
    <div class="dev-identity">
      <strong>Damophus Dev</strong>
      <span>{locale === "zh-CN" ? "本地模拟数据" : "Local mock data"}</span>
    </div>

    <div class="dev-controls">
      <div class="segmented" aria-label={locale === "zh-CN" ? "预览宽度" : "Preview width"}>
        <button
          type="button"
          title={locale === "zh-CN" ? "桌面宽度" : "Desktop width"}
          aria-label={locale === "zh-CN" ? "桌面宽度" : "Desktop width"}
          aria-pressed={viewMode === "desktop"}
          on:click={() => viewMode = "desktop"}
        ><Monitor size={17} /></button>
        <button
          type="button"
          title={locale === "zh-CN" ? "手机宽度" : "Mobile width"}
          aria-label={locale === "zh-CN" ? "手机宽度" : "Mobile width"}
          aria-pressed={viewMode === "mobile"}
          on:click={() => viewMode = "mobile"}
        ><Smartphone size={17} /></button>
      </div>

      <button
        class="tool-button locale-button"
        type="button"
        title={locale === "zh-CN" ? "切换为英文" : "Switch to Chinese"}
        aria-label={locale === "zh-CN" ? "切换为英文" : "Switch to Chinese"}
        on:click={() => locale = locale === "zh-CN" ? "en" : "zh-CN"}
      >
        <Languages size={17} />
        <span>{locale === "zh-CN" ? "中" : "EN"}</span>
      </button>

      <button
        class="tool-button"
        type="button"
        title={colorMode === "light" ? (locale === "zh-CN" ? "深色模式" : "Dark mode") : (locale === "zh-CN" ? "浅色模式" : "Light mode")}
        aria-label={colorMode === "light" ? (locale === "zh-CN" ? "深色模式" : "Dark mode") : (locale === "zh-CN" ? "浅色模式" : "Light mode")}
        on:click={() => colorMode = colorMode === "light" ? "dark" : "light"}
      >
        {#if colorMode === "light"}<Moon size={17} />{:else}<Sun size={17} />{/if}
      </button>

      <button
        class="tool-button"
        type="button"
        title={locale === "zh-CN" ? "重置模拟数据" : "Reset mock data"}
        aria-label={locale === "zh-CN" ? "重置模拟数据" : "Reset mock data"}
        on:click={reset}
      ><RotateCcw size={17} /></button>
    </div>
  </header>

  <section class="preview-stage" data-view-mode={viewMode}>
    <div class="preview-frame damophus-theme-root damophus-question-bank-theme" data-color-mode={colorMode}>
      {#key revision}
        <QuestionBank
          {controller}
          initialDocumentId={devDocumentId}
          {translations}
          uuid={() => crypto.randomUUID()}
          {openQuestionSource}
        />
      {/key}
    </div>
  </section>

  {#if sourceNotice}
    <div class="dev-toast" role="status">{sourceNotice}</div>
  {/if}
</main>
