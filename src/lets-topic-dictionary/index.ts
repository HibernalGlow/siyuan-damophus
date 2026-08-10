import { openTab, type Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { resolveSiyuanPluginIcon } from "@/libs/plugin-icons";
import { plugin } from "@/utils";
import { siyuanKernelClient } from "@/question-bank/adapters/siyuan/client";
import { SiyuanPluginStoreFileIO } from "@/question-bank/adapters/tinybase/siyuan-file-io";
import {
  TOPIC_DICTIONARY_UPDATED_EVENT,
  TopicDictionaryStore,
} from "@/question-bank/adapters/siyuan/topic-dictionary";
import { renderTopicDictionary, type TopicDictionaryOperations } from "./dock";
import { topicDictionaryAppearance } from "./plugin";
import {
  topicDictionaryDockType,
  topicDictionaryTabTarget,
  topicDictionaryTabType,
} from "./tab-contract";
import "./topic-dictionary.css";

const dictionaryIcon = resolveSiyuanPluginIcon(topicDictionaryAppearance.icon);

export default class TopicDictionaryPlugin extends SubPluginBase {
  private tabRegistered = false;
  private openEntry?: UnifiedEntryPoint;
  private dockCleanup?: () => void;
  private dockTarget?: HTMLElement;
  private readonly tabCleanups = new Map<HTMLElement, () => void>();
  private readonly store = new TopicDictionaryStore(
    new SiyuanPluginStoreFileIO(plugin, siyuanKernelClient),
    siyuanKernelClient,
  );

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: topicDictionaryTabType,
      init() {
        const element = this.element as HTMLElement;
        owner.tabCleanups.get(element)?.();
        owner.tabCleanups.set(element, owner.render(element));
      },
      destroy() {
        const element = this.element as HTMLElement;
        owner.tabCleanups.get(element)?.();
        owner.tabCleanups.delete(element);
      },
    });
  }

  override onload(): void {
    this.openEntry ??= this.createOpenEntry();
    this.openEntry.setSurfaces(this.configuredEntrySurfaces());
    this.openEntry.setEnabled(true);
    this.renderOpenViews();
  }

  override onunload(): void {
    this.openEntry?.setEnabled(false);
    this.dockCleanup?.();
    this.dockCleanup = undefined;
    for (const cleanup of this.tabCleanups.values()) cleanup();
    this.tabCleanups.clear();
  }

  addMenuItem(menu: Menu): void {
    this.openEntry?.addMenuItem(menu);
  }

  private operations(): TopicDictionaryOperations {
    return {
      load: () => this.store.load(),
      scan: async () => {
        const result = await this.store.scan();
        window.dispatchEvent(new Event(TOPIC_DICTIONARY_UPDATED_EVENT));
        return result;
      },
      saveLabels: async (labels) => {
        const document = await this.store.saveLabels(labels);
        window.dispatchEvent(new Event(TOPIC_DICTIONARY_UPDATED_EVENT));
        return document;
      },
      setAutoScanOnOpen: (value) => this.setSetting("autoScanOnOpen", value),
    };
  }

  private render(target: HTMLElement, onOpenTab?: () => void): () => void {
    return renderTopicDictionary(target, this.labels(), this.operations(), {
      autoScanOnOpen: this.getSetting("autoScanOnOpen") === true,
    }, onOpenTab);
  }

  private renderDock(): void {
    if (!this.dockTarget) return;
    this.dockCleanup?.();
    this.dockCleanup = this.render(
      this.dockTarget,
      this.isEntryEnabled("tab") ? () => this.openInTab() : undefined,
    );
  }

  private renderOpenViews(): void {
    this.renderDock();
    for (const [element, cleanup] of this.tabCleanups) {
      cleanup();
      this.tabCleanups.set(element, this.render(element));
    }
  }

  private createOpenEntry(): UnifiedEntryPoint {
    return new UnifiedEntryPoint({
      id: "topic-dictionary.open",
      title: this.t("lets-topic-dictionary.menu"),
      icon: dictionaryIcon,
      execute: () => this.openConfiguredSurface(),
      command: {langKey: "lets-topic-dictionary.commandOpen"},
      dock: {
        config: {
          position: "RightBottom",
          size: {width: 440, height: 0},
          icon: dictionaryIcon,
          title: this.t("lets-topic-dictionary.displayName"),
          show: false,
        },
        data: {},
        type: topicDictionaryDockType,
        init: (target) => {
          this.dockTarget = target;
          this.renderDock();
        },
        destroy: () => {
          this.dockCleanup?.();
          this.dockCleanup = undefined;
          this.dockTarget = undefined;
        },
      },
    }, plugin);
  }

  private configuredEntrySurfaces() {
    const dock = this.isEntryEnabled("dock");
    const tab = this.isEntryEnabled("tab");
    const hasTarget = dock || tab;
    return {
      menu: hasTarget && this.isEntryEnabled("menu"),
      dock,
      command: hasTarget && this.isEntryEnabled("command"),
    };
  }

  private openConfiguredSurface(): void {
    if (this.isEntryEnabled("dock") && this.openEntry?.openDock()) return;
    if (this.isEntryEnabled("tab")) this.openInTab();
  }

  private openInTab(): void {
    void openTab({
      app: plugin.app,
      custom: {
        icon: dictionaryIcon,
        title: this.t("lets-topic-dictionary.displayName"),
        ...topicDictionaryTabTarget(plugin.name),
      },
    });
  }

  private labels() {
    return {
      title: this.t("lets-topic-dictionary.displayName"),
      scan: this.t("lets-topic-dictionary.scan"),
      save: this.t("lets-topic-dictionary.save"),
      search: this.t("lets-topic-dictionary.search"),
      groupBy: this.t("lets-topic-dictionary.groupBy"),
      filterState: this.t("lets-topic-dictionary.filterState"),
      all: this.t("lets-topic-dictionary.all"),
      present: this.t("lets-topic-dictionary.present"),
      retired: this.t("lets-topic-dictionary.retired"),
      subject: this.t("lets-topic-dictionary.subject"),
      category: this.t("lets-topic-dictionary.category"),
      collection: this.t("lets-topic-dictionary.collection"),
      source: this.t("lets-topic-dictionary.source"),
      unclassified: this.t("lets-topic-dictionary.unclassified"),
      displayName: this.t("lets-topic-dictionary.displayNameField"),
      suggestedName: this.t("lets-topic-dictionary.suggestedName"),
      empty: this.t("lets-topic-dictionary.empty"),
      loading: this.t("lets-topic-dictionary.loading"),
      saved: this.t("lets-topic-dictionary.saved"),
      scanResult: this.t("lets-topic-dictionary.scanResult"),
      visibleCount: this.t("lets-topic-dictionary.visibleCount"),
      autoScanOnOpen: this.t("lets-topic-dictionary.autoScanOnOpen"),
      openTab: this.t("lets-topic-dictionary.openTab"),
    };
  }
}
