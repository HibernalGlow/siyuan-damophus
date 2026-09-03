// Shared rule-tree helpers for the condition editor dialog. Both the question
// bank and the cover-template editors keep their own persisted tree shape, so
// these operate on a loose structural type instead of library generics.
interface QueryGroupLike {
  rules: unknown[];
  name?: string;
  [key: string]: unknown;
}

function isGroup(value: unknown): value is QueryGroupLike {
  return typeof value === "object" && value !== null && "rules" in value;
}

/** Immutably renames the group at `path` (empty name removes the label). */
export function renameGroupInQuery<T>(query: T, path: readonly number[], name: string): T {
  const segments = [...path];
  const trimmed = name.trim();
  const update = (group: QueryGroupLike, depth: number): QueryGroupLike => {
    if (depth === segments.length) {
      const { name: _discarded, ...rest } = group;
      return (trimmed ? { ...group, name: trimmed } : rest) as QueryGroupLike;
    }
    const index = segments[depth];
    return {
      ...group,
      rules: group.rules.map((entry, entryIndex) =>
        entryIndex === index && isGroup(entry) ? update(entry, depth + 1) : entry),
    };
  };
  return update(query as unknown as QueryGroupLike, 0) as unknown as T;
}
