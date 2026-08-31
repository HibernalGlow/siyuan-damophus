<script lang="ts">
  import { CheckCircle2, Info, Key, Loader2, Plus, Trash2, XCircle } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { testBooruSiteCredential } from "../booru";
  import type { SiteCredential } from "../sources";

  export let label: (key: string, fallback: string) => string;
  export let credentials: SiteCredential[] = [];
  export let onAdd: () => void;
  export let onUpdate: (index: number, patch: Partial<SiteCredential>) => void;
  export let onRemove: (index: number) => void;

  let testingId: string | null = null;
  let testResults: Record<string, { success: boolean; message: string; samplePostUrl?: string }> = {};
  let infoOpen = false;

  async function test(cred: SiteCredential) {
    testingId = cred.id;
    delete testResults[cred.id];
    testResults = { ...testResults };
    try {
      testResults[cred.id] = await testBooruSiteCredential(cred.site, cred.login, cred.apiKey);
    } catch (e: any) {
      testResults[cred.id] = { success: false, message: e?.message || String(e) };
    } finally {
      testingId = null;
      testResults = { ...testResults };
    }
  }
</script>

<div class="mb-stack">
  <section class="mb-section">
    <div class="mb-section-copy">
      <span class="mb-icon-chip" aria-hidden="true"><Key class="size-4" /></span>
      <div class="min-w-0">
        <div class="mb-section-title">
          <span class="mb-truncate">{label("lets-more-background.credentialsTitle", "多站点 API 凭据")}</span>
          <span class="mb-count-badge">{credentials.length}</span>
          <button
            type="button"
            class="mb-info-btn"
            class:open={infoOpen}
            aria-expanded={infoOpen}
            title={label("lets-more-background.toggleSectionInfo", "展开或收起说明")}
            aria-label={label("lets-more-background.toggleSectionInfo", "展开或收起说明")}
            onclick={() => (infoOpen = !infoOpen)}
          >
            <Info class="size-3" />
          </button>
        </div>
        {#if infoOpen}
          <p class="mb-section-desc">
            {label("lets-more-background.credentialsDescription", "分别配置各个 Booru 站点的登录账号与 API Key，用于解除并发和多标签搜索限制。Safebooru 等公开免密站点可直接使用。")}
          </p>
        {/if}
      </div>
    </div>
    <div class="mb-section-actions">
      <Button variant="secondary" size="sm" class="mb-toolbar-primary gap-1.5" onclick={onAdd}>
        <Plus class="size-3.5" />
        <span>{label("lets-more-background.addCredential", "添加站点凭据")}</span>
      </Button>
    </div>
  </section>

  {#each credentials as cred, index (cred.id || index)}
    <section class="mb-card">
      <div class="mb-card-body">
        <div class="cred-grid">
          <div>
            <Label class="mb-field-label">{label("lets-more-background.credSite", "站点域名")}</Label>
            <Input
              value={cred.site || ""}
              oninput={(e) => onUpdate(index, { site: (e.target as HTMLInputElement).value })}
              placeholder="danbooru.donmai.us"
              class="h-8 w-full bg-background font-mono text-xs"
            />
          </div>
          <div>
            <Label class="mb-field-label">{label("lets-more-background.credLogin", "用户名 / Login ID")}</Label>
            <Input
              value={cred.login || ""}
              oninput={(e) => onUpdate(index, { login: (e.target as HTMLInputElement).value })}
              placeholder={label("lets-more-background.credLoginPlaceholder", "您的登录名 / User ID")}
              class="h-8 w-full bg-background text-xs"
            />
          </div>
          <div>
            <Label class="mb-field-label">{label("lets-more-background.credApiKey", "API Key 密钥")}</Label>
            <Input
              type="password"
              value={cred.apiKey || ""}
              oninput={(e) => onUpdate(index, { apiKey: (e.target as HTMLInputElement).value })}
              placeholder="API Key / Token"
              class="h-8 w-full bg-background font-mono text-xs"
            />
          </div>
        </div>

        <div class="cred-foot">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" class="gap-1.5 font-medium" disabled={testingId === cred.id} onclick={() => test(cred)}>
              {#if testingId === cred.id}
                <Loader2 class="size-3.5 animate-spin" />
                <span>{label("lets-more-background.testing", "测试中...")}</span>
              {:else}
                <Key class="size-3.5 text-primary" />
                <span>{label("lets-more-background.testConnection", "测试连接")}</span>
              {/if}
            </Button>
            {#if testResults[cred.id]}
              <Badge
                variant={testResults[cred.id].success ? "secondary" : "destructive"}
                class="gap-1.5 px-2.5 py-1 text-xs {testResults[cred.id].success ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''}"
              >
                {#if testResults[cred.id].success}
                  <CheckCircle2 class="size-3.5" />
                {:else}
                  <XCircle class="size-3.5" />
                {/if}
                <span class="mb-truncate max-w-[220px]">{testResults[cred.id].message}</span>
              </Badge>
            {/if}
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="self-end text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onclick={() => onRemove(index)}
          >
            <Trash2 class="mr-1 size-3.5" />
            <span>{label("lets-more-background.removeCredential", "删除凭据")}</span>
          </Button>
        </div>
      </div>
    </section>
  {/each}
</div>

<style>
  .cred-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .cred-foot {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--b3-border-color);
  }

  @container mbframe (min-width: 560px) {
    .cred-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .cred-foot {
      flex-direction: row;
      align-items: center;
    }
  }
</style>
