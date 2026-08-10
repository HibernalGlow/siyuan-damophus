import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  emptyTopicDictionary,
  mergeTopicDictionaryScan,
  updateTopicDictionaryLabels,
} from "@/question-bank/topic-dictionary";
import { zhCN } from "@/translations/parts/lets-topic-dictionary";
import { renderTopicDictionary } from "./dock";
import "./topic-dictionary.css";

const labels = {
  title: zhCN["lets-topic-dictionary.displayName"],
  scan: zhCN["lets-topic-dictionary.scan"],
  save: zhCN["lets-topic-dictionary.save"],
  search: zhCN["lets-topic-dictionary.search"],
  groupBy: zhCN["lets-topic-dictionary.groupBy"],
  filterState: zhCN["lets-topic-dictionary.filterState"],
  all: zhCN["lets-topic-dictionary.all"],
  present: zhCN["lets-topic-dictionary.present"],
  retired: zhCN["lets-topic-dictionary.retired"],
  subject: zhCN["lets-topic-dictionary.subject"],
  category: zhCN["lets-topic-dictionary.category"],
  collection: zhCN["lets-topic-dictionary.collection"],
  source: zhCN["lets-topic-dictionary.source"],
  unclassified: zhCN["lets-topic-dictionary.unclassified"],
  displayName: zhCN["lets-topic-dictionary.displayNameField"],
  suggestedName: zhCN["lets-topic-dictionary.suggestedName"],
  empty: zhCN["lets-topic-dictionary.empty"],
  loading: zhCN["lets-topic-dictionary.loading"],
  saved: zhCN["lets-topic-dictionary.saved"],
  scanResult: zhCN["lets-topic-dictionary.scanResult"],
  visibleCount: zhCN["lets-topic-dictionary.visibleCount"],
  autoScanOnOpen: zhCN["lets-topic-dictionary.autoScanOnOpen"],
  openTab: zhCN["lets-topic-dictionary.openTab"],
};

const fixtureText = {
  subject: "\u6c11\u6cd5",
  category: "\u5408\u540c",
  topicName: "\u5408\u540c\u6548\u529b",
  editedTopicName: "\u5408\u540c\u7684\u6548\u529b",
} as const;

function dictionary() {
  return updateTopicDictionaryLabels(
    mergeTopicDictionaryScan(emptyTopicDictionary("2026-08-10T00:00:00.000Z"), [
      {
        topicId: "civil-contract-validity",
        suggestedName: fixtureText.topicName,
        subjects: [fixtureText.subject],
        categories: [fixtureText.category],
      },
    ], "2026-08-10T01:00:00.000Z"),
    {"civil-contract-validity": fixtureText.topicName},
    "2026-08-10T02:00:00.000Z",
  );
}

describe("topic dictionary maintenance", () => {
  it("loads without scanning by default, then scans and saves on explicit actions", async () => {
    let current = dictionary();
    const operations = {
      load: vi.fn(async () => current),
      scan: vi.fn(async () => ({
        document: current,
        discoveredCount: 1,
        presentCount: 1,
        retiredCount: 0,
        newTopicIds: [],
      })),
      saveLabels: vi.fn(async (updates: Readonly<Record<string, string>>) => {
        current = updateTopicDictionaryLabels(current, updates, "2026-08-10T03:00:00.000Z");
        return current;
      }),
      setAutoScanOnOpen: vi.fn(),
    };
    const target = document.createElement("div");
    target.style.width = "900px";
    target.style.height = "640px";
    document.body.append(target);
    const cleanup = renderTopicDictionary(target, labels, operations, {autoScanOnOpen: false});

    await expect.poll(() => target.textContent).toContain("civil-contract-validity");
    expect(operations.load).toHaveBeenCalledTimes(1);
    expect(operations.scan).not.toHaveBeenCalled();
    expect(target.textContent).toContain(fixtureText.subject);

    (Array.from(target.querySelectorAll("button")).find((button) => button.textContent?.includes(labels.scan)) as HTMLButtonElement).click();
    await expect.poll(() => operations.scan).toHaveBeenCalledTimes(1);

    const nameInput = target.querySelector<HTMLInputElement>(`[aria-label="${labels.displayName}: civil-contract-validity"]`);
    if (!nameInput) throw new Error("Missing topic name input");
    await userEvent.fill(nameInput, fixtureText.editedTopicName);
    (Array.from(target.querySelectorAll("button")).find((button) => button.textContent?.includes(labels.save)) as HTMLButtonElement).click();
    await expect.poll(() => operations.saveLabels).toHaveBeenCalledWith({
      "civil-contract-validity": fixtureText.editedTopicName,
    });

    cleanup();
    target.remove();
  });

  it("runs the scan on view open only when the opt-in switch is enabled", async () => {
    const current = dictionary();
    const operations = {
      load: vi.fn(async () => current),
      scan: vi.fn(async () => ({
        document: current,
        discoveredCount: 1,
        presentCount: 1,
        retiredCount: 0,
        newTopicIds: [],
      })),
      saveLabels: vi.fn(async () => current),
      setAutoScanOnOpen: vi.fn(),
    };
    const target = document.createElement("div");
    document.body.append(target);
    const cleanup = renderTopicDictionary(target, labels, operations, {autoScanOnOpen: true});

    await expect.poll(() => operations.scan).toHaveBeenCalledTimes(1);

    cleanup();
    target.remove();
  });
});
