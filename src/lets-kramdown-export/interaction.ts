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
