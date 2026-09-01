export async function assertAttrWriteSucceeded(response: Response): Promise<void> {
  let body: { code?: number } | null = null;
  try { body = await response.json() as { code?: number }; } catch { /* some test hosts return an empty body */ }
  if (response.ok === false || (typeof body?.code === "number" && body.code !== 0)) {
    throw new Error(`setBlockAttrs failed (${body?.code ?? response.status})`);
  }
}

export async function readBlockAttrs(blockId: string): Promise<Record<string, string>> {
  try {
    const response = await fetch("/api/attr/getBlockAttrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: blockId }),
    });
    const data = await response.json();
    return (data?.data || {}) as Record<string, string>;
  } catch {
    return {};
  }
}
