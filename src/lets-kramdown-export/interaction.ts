export function selectedBlockIds(elements: readonly HTMLElement[]): string[] {
  const selected = [...new Set(elements.filter((element) => element.dataset.nodeId))];
  return selected
    .filter((element) => !selected.some((candidate) => candidate !== element && candidate.contains(element)))
    .map((element) => element.dataset.nodeId!);
}

export async function copyMarkdown(markdown: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(markdown);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = markdown;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy was rejected");
  }
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
