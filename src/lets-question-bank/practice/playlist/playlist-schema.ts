import { z } from "zod";

const nodeIdSchema = z.string().regex(/^\d{14}-[a-z0-9]{7}$/u);

/**
 * A named practice playlist that resolves to a question ID set at launch time.
 * The point database is user-owned (rows = exam points); relation keys on that
 * database link each row to rows of a user-maintained question database whose
 * bound blocks are question headings, topic headings, or whole documents.
 */
export const PracticePlaylistSchema = z.object({
  schema_version: z.literal(1),
  playlist_id: z.string().min(1),
  revision: z.number().int().positive(),
  name: z.string().min(1),
  point_av_id: nodeIdSchema,
  /** Omitted = include every row of the point database. */
  view_id: nodeIdSchema.optional(),
  /** Relation keys on the point database to follow; every listed key must carry a relation. */
  relation_key_ids: z.array(nodeIdSchema),
  include_subdocuments: z.boolean(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export type PracticePlaylist = z.infer<typeof PracticePlaylistSchema>;

/** Parses and normalizes a stored playlists array: drops invalid entries, dedupes by ID. */
export function parsePracticePlaylists(value: unknown): PracticePlaylist[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: PracticePlaylist[] = [];
  for (const item of value) {
    const parsed = PracticePlaylistSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.playlist_id)) continue;
    seen.add(parsed.data.playlist_id);
    result.push(parsed.data);
  }
  return result;
}

/** Stable serialization (id order preserved) used to detect settings drift. */
export function serializePracticePlaylists(playlists: readonly PracticePlaylist[]): string {
  return JSON.stringify(playlists);
}
