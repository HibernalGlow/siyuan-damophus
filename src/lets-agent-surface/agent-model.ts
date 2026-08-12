export type AgentModel = {
  panelElement?: HTMLElement;
  insertBlockMentions?: (mentions: Array<{ id: string; label: string }>) => void;
  applySessionModelIfValid?: (modelId: string) => void;
};

type ResolveAgentModelOptions = {
  resolve: () => AgentModel | undefined;
  activate: () => void;
  attempts?: number;
  delayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
};

export type ResolvedAgentModel = {
  model?: AgentModel;
  created: boolean;
};

function defaultWait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export async function resolveAgentModel({
  resolve,
  activate,
  attempts = 40,
  delayMs = 25,
  wait = defaultWait,
}: ResolveAgentModelOptions): Promise<ResolvedAgentModel> {
  const existing = resolve();
  if (existing?.panelElement) return { model: existing, created: false };

  activate();
  const immediate = resolve();
  if (immediate?.panelElement) return { model: immediate, created: true };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(delayMs);
    const model = resolve();
    if (model?.panelElement) return { model, created: true };
  }
  return { created: true };
}

export function configuredAgentModelId(config: unknown): string | undefined {
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  const agent = (config as { agent?: unknown }).agent;
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) return undefined;
  const modelId = (agent as { modelId?: unknown }).modelId;
  return typeof modelId === "string" && modelId ? modelId : undefined;
}

export function applyConfiguredAgentModel(model: AgentModel, config: unknown): boolean {
  const modelId = configuredAgentModelId(config);
  if (!modelId || typeof model.applySessionModelIfValid !== "function") return false;
  model.applySessionModelIfValid(modelId);
  return true;
}
