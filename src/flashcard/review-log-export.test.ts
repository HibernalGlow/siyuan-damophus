import { encode } from "@msgpack/msgpack";
import { describe, expect, it } from "vitest";
import {
  decodeReviewLog,
  filterReviewLogEntries,
  groupReviewLogEntriesByMonth,
  loadReviewLogArchive,
  monthlyReviewLogZip,
  reviewLogToCsv,
  type ReviewLogReader,
} from "./review-log-export";
import JSZip from "jszip";

function entry(id: string, reviewed: number, cardId = `card-${id}`) {
  return {
    ID: id,
    CardID: cardId,
    Rating: 3,
    ScheduledDays: 7,
    ElapsedDays: 8,
    Reviewed: reviewed,
    State: 2,
  };
}

describe("Riff review log export", () => {
  it("decodes the current SiYuan MessagePack schema", () => {
    expect(decodeReviewLog(encode([entry("log-1", 1_700_000_000)]))).toEqual([{
      id: "log-1",
      cardId: "card-log-1",
      rating: 3,
      scheduledDays: 7,
      elapsedDays: 8,
      reviewed: 1_700_000_000,
      state: 2,
    }]);
  });

  it("rejects an incompatible future log schema instead of exporting corrupt CSV", () => {
    expect(() => decodeReviewLog(encode([{ CardID: "card-1" }]))).toThrow("Missing ID");
    expect(() => decodeReviewLog(encode({ entries: [] }))).toThrow("root is not an array");
  });

  it("produces FSRS optimizer columns with millisecond timestamps", () => {
    const [decoded] = decodeReviewLog(encode([entry("log-1", 1_700_000_000, "card,1")]));
    expect(reviewLogToCsv([decoded])).toBe([
      "card_id,review_time,review_rating,review_state,review_duration",
      '"card,1",1700000000000,3,2,0',
      "",
    ].join("\n"));
  });

  it("scans each file once, sorts records and reports skipped files and duplicates", async () => {
    const readFile = async (file: { month: string }) => {
      if (file.month === "202602") return encode({ incompatible: true });
      return encode(file.month === "202601"
        ? [entry("later", 20), entry("duplicate", 10)]
        : [entry("duplicate", 10), entry("earlier", 5)]);
    };
    const reader: ReviewLogReader = {
      listFiles: async () => [
        { name: "202601.msgpack", month: "202601" },
        { name: "202602.msgpack", month: "202602" },
        { name: "202603.msgpack", month: "202603" },
      ],
      readFile,
    };
    const archive = await loadReviewLogArchive(reader);
    expect(archive.entries.map((item) => item.id)).toEqual(["earlier", "duplicate", "later"]);
    expect(archive.duplicateCount).toBe(1);
    expect(archive.entriesByMonth.get("202603")?.map((item) => item.id)).toEqual(["earlier"]);
    expect(archive.errors).toEqual([{ file: "202602.msgpack", message: "The Riff log root is not an array" }]);
    expect(archive.firstReviewedAt).toBe(5_000);
    expect(archive.lastReviewedAt).toBe(20_000);
  });

  it("creates monthly CSV files plus a merged revlog", async () => {
    const one = decodeReviewLog(encode([entry("one", 10)]));
    const two = decodeReviewLog(encode([entry("two", 20)]));
    const bytes = await monthlyReviewLogZip({
      files: [{ name: "202601.msgpack", month: "202601" }, { name: "202602.msgpack", month: "202602" }],
      entries: [...one, ...two],
      entriesByMonth: new Map([["202601", one], ["202602", two]]),
      duplicateCount: 0,
      errors: [],
      firstReviewedAt: 10_000,
      lastReviewedAt: 20_000,
    });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(["202601.csv", "202602.csv", "revlog.csv"]);
    expect(await zip.file("revlog.csv")!.async("string")).toContain("card-two,20000,3,2,0");
  });

  it("filters review records by time, scope and review state without mutating the archive", () => {
    const entries = [
      { id: "a", cardId: "card-a", rating: 3, scheduledDays: 1, elapsedDays: 1, reviewed: 100, state: 0 },
      { id: "b", cardId: "card-b", rating: 4, scheduledDays: 2, elapsedDays: 2, reviewed: 200, state: 2 },
      { id: "c", cardId: "card-c", rating: 1, scheduledDays: 3, elapsedDays: 3, reviewed: 300, state: 3 },
    ];
    const contexts = new Map([
      ["card-a", { cardId: "card-a", documentId: "doc-a", notebookId: "book-a" }],
      ["card-b", { cardId: "card-b", documentId: "doc-b", notebookId: "book-a" }],
      ["card-c", { cardId: "card-c", documentId: "doc-c", notebookId: "book-b" }],
    ]);
    expect(filterReviewLogEntries(entries, {
      fromReviewed: 150_000,
      toReviewed: 250_000,
      notebookId: "book-a",
      state: 2,
    }, contexts).map((entry) => entry.id)).toEqual(["b"]);
    expect(entries.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("includes descendant documents only when the document scope switch is enabled", () => {
    const entries = [
      { id: "root", cardId: "root-card", rating: 3, scheduledDays: 1, elapsedDays: 1, reviewed: 100, state: 2 },
      { id: "child", cardId: "child-card", rating: 3, scheduledDays: 1, elapsedDays: 1, reviewed: 200, state: 2 },
      { id: "sibling", cardId: "sibling-card", rating: 3, scheduledDays: 1, elapsedDays: 1, reviewed: 300, state: 2 },
    ];
    const contexts = new Map([
      ["root-card", { cardId: "root-card", documentId: "doc-root", documentPath: "/Study/Root" }],
      ["child-card", { cardId: "child-card", documentId: "doc-child", documentPath: "/Study/Root/Child" }],
      ["sibling-card", { cardId: "sibling-card", documentId: "doc-sibling", documentPath: "/Study/Rootish" }],
    ]);
    expect(filterReviewLogEntries(entries, {
      documentId: "doc-root",
      documentPath: "/Study/Root",
      includeSubdocuments: true,
    }, contexts).map((item) => item.id)).toEqual(["root", "child"]);
    expect(filterReviewLogEntries(entries, {
      documentId: "doc-root",
      documentPath: "/Study/Root",
      includeSubdocuments: false,
    }, contexts).map((item) => item.id)).toEqual(["root"]);
    expect(filterReviewLogEntries(entries, {
      documentPath: "/Study",
      includeSubdocuments: true,
    }, contexts).map((item) => item.id)).toEqual(["root", "child", "sibling"]);
  });

  it("groups an arbitrary filtered selection into local calendar months", () => {
    const entries = [
      { id: "a", cardId: "a", rating: 3, scheduledDays: 1, elapsedDays: 1, reviewed: Date.UTC(2026, 0, 2) / 1000, state: 2 },
      { id: "b", cardId: "b", rating: 3, scheduledDays: 1, elapsedDays: 1, reviewed: Date.UTC(2026, 1, 2) / 1000, state: 2 },
    ];
    expect([...groupReviewLogEntriesByMonth(entries).keys()]).toEqual(["202601", "202602"]);
  });
});
