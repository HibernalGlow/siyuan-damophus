import { encode } from "@msgpack/msgpack";
import { describe, expect, it } from "vitest";
import {
  decodeReviewLog,
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
});
