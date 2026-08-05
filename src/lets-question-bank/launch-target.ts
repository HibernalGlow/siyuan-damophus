const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

interface NodeIdElement {
  dataset: {
    nodeId?: string;
  };
}

export function validLaunchBlockId(value: unknown): string | undefined {
  return typeof value === "string" && nodeIdPattern.test(value) ? value : undefined;
}

export function launchBlockIdFromElements(
  elements: ArrayLike<NodeIdElement>,
): string | undefined {
  if (elements.length !== 1) return undefined;
  return validLaunchBlockId(elements[0]?.dataset.nodeId);
}
