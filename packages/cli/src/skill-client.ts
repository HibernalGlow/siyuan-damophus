const DEFAULT_ENDPOINT = process.env.DAMOPHUS_SIYUAN_URL || "http://127.0.0.1:6806";

interface KernelEnvelope<T> {
  code: number;
  msg?: string;
  data: T;
}

export interface SkillSummary {
  name: string;
  description: string;
}

export interface SkillDocument {
  name: string;
  content: string;
}

export function defaultSiyuanEndpoint(): string {
  return DEFAULT_ENDPOINT;
}

async function postKernel<T>(endpoint: string, path: string, body: unknown): Promise<T> {
  const normalizedEndpoint = endpoint.replace(/\/+$/u, "");
  let response: Response;
  try {
    response = await fetch(`${normalizedEndpoint}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`SiYuan is not reachable at ${normalizedEndpoint}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`SiYuan returned HTTP ${response.status}`);
  const envelope = await response.json() as KernelEnvelope<T>;
  if (envelope.code !== 0) throw new Error(envelope.msg || `SiYuan skill API failed with code ${envelope.code}`);
  return envelope.data;
}

export function listSkills(endpoint = DEFAULT_ENDPOINT): Promise<SkillSummary[]> {
  return postKernel<SkillSummary[] | null>(endpoint, "/api/ai/agent/lsSkills", {})
    .then((skills) => skills || []);
}

export async function getSkill(endpoint: string, name: string): Promise<SkillDocument> {
  const skill = await postKernel<Partial<SkillDocument>>(endpoint, "/api/ai/agent/getSkill", { name });
  return { name: skill.name || name, content: skill.content || "" };
}

export async function saveSkill(endpoint: string, name: string, content: string): Promise<void> {
  await postKernel(endpoint, "/api/ai/agent/saveSkill", { name, content });
}

export async function renameSkill(endpoint: string, oldName: string, newName: string): Promise<void> {
  await postKernel(endpoint, "/api/ai/agent/renameSkill", { oldName, newName });
}

export async function removeSkill(endpoint: string, name: string): Promise<void> {
  await postKernel(endpoint, "/api/ai/agent/removeSkill", { name });
}
