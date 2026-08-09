import {
  getSkill,
  inspectSkillSourceRoot,
  listSkills,
  removeSkill,
  renameSkill,
  saveSkill,
  syncSkillFromRoot,
  syncSkillSourceRoot,
  type SkillDocument,
  type SkillSummary,
  type SkillSyncOptions,
  type SkillSyncResult,
  type SkillSyncState,
  type SkillSyncSummary,
} from "./api";

export interface SkillManagerLabels {
  title: string;
  refresh: string;
  openTab: string;
  source: string;
  syncAll: string;
  update: string;
  newSkill: string;
  select: string;
  content: string;
  save: string;
  rename: string;
  remove: string;
  empty: string;
  saved: string;
  synced: string;
  syncResult: string;
  failed: string;
  confirmRemove: string;
  states: Record<SkillSyncState, string>;
}

export interface SkillManagerConfig {
  sourceRoot: string;
  onlyChanged: boolean;
  syncOptions: SkillSyncOptions;
}

export interface SkillManagerOperations {
  listSkills(): Promise<SkillSummary[] | null>;
  getSkill(name: string): Promise<SkillDocument>;
  saveSkill(name: string, content: string): Promise<void>;
  renameSkill(oldName: string, newName: string): Promise<void>;
  removeSkill(name: string): Promise<void>;
  inspectSkillSourceRoot(sourceRoot: string): Promise<SkillSyncSummary[]>;
  syncSkillSourceRoot(
    sourceRoot: string,
    onlyChanged: boolean,
    options?: SkillSyncOptions,
  ): Promise<SkillSyncResult>;
  syncSkillFromRoot(sourceRoot: string, name: string, options?: SkillSyncOptions): Promise<void>;
}

const defaultOperations: SkillManagerOperations = {
  listSkills,
  getSkill,
  saveSkill,
  renameSkill,
  removeSkill,
  inspectSkillSourceRoot,
  syncSkillSourceRoot,
  syncSkillFromRoot,
};

function icon(name: string): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", `#${name}`);
  svg.append(use);
  return svg;
}

function button(label: string, iconName: string, handler: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "b3-button b3-button--outline damophus-skill-manager__button";
  element.title = label;
  element.setAttribute("aria-label", label);
  element.append(icon(iconName), document.createTextNode(label));
  element.addEventListener("click", handler);
  return element;
}

export function renderSkillManagerDock(
  target: HTMLElement,
  labels: SkillManagerLabels,
  config: SkillManagerConfig,
  operations: SkillManagerOperations = defaultOperations,
  onOpenTab?: () => void,
): () => void {
  let skills: SkillSyncSummary[] = [];
  let installedNames = new Set<string>();
  let selected = "";
  const root = document.createElement("section");
  root.className = "damophus-skill-manager";
  root.setAttribute("aria-label", labels.title);

  const toolbar = document.createElement("header");
  toolbar.className = "damophus-skill-manager__toolbar";
  const heading = document.createElement("h2");
  heading.textContent = labels.title;
  const create = button(labels.newSkill, "iconAdd", () => createSkill());
  const syncAll = button(labels.syncAll, "iconUpload", () => void syncAllSkills());
  const refresh = button(labels.refresh, "iconRefresh", () => void refreshSkills());
  toolbar.append(heading, create, syncAll, refresh);
  if (onOpenTab) toolbar.append(button(labels.openTab, "iconOpen", onOpenTab));

  const source = document.createElement("div");
  source.className = "damophus-skill-manager__source";
  source.title = config.sourceRoot;
  source.append(icon("iconFolder"), document.createTextNode(`${labels.source}: ${config.sourceRoot}`));

  const body = document.createElement("div");
  body.className = "damophus-skill-manager__body";
  const list = document.createElement("div");
  list.className = "damophus-skill-manager__list";
  list.setAttribute("role", "listbox");
  const editor = document.createElement("div");
  editor.className = "damophus-skill-manager__editor";
  const name = document.createElement("input");
  name.className = "b3-text-field";
  name.type = "text";
  name.setAttribute("aria-label", labels.select);
  const content = document.createElement("textarea");
  content.className = "b3-text-field damophus-skill-manager__content";
  content.setAttribute("aria-label", labels.content);
  const actions = document.createElement("div");
  actions.className = "damophus-skill-manager__actions";
  const save = button(labels.save, "iconSave", () => void saveCurrent());
  const rename = button(labels.rename, "iconEdit", () => void renameCurrent());
  const remove = button(labels.remove, "iconTrashcan", () => void removeCurrent());
  actions.append(save, rename, remove);
  editor.append(name, content, actions);
  body.append(list, editor);
  const status = document.createElement("div");
  status.className = "damophus-skill-manager__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(toolbar, source, body, status);
  target.replaceChildren(root);

  function setStatus(message: string, error = false): void {
    root.dataset.status = error ? "error" : "ok";
    status.textContent = message;
  }

  function createSkill(): void {
    selected = "";
    name.value = "";
    content.value = "";
    renderList();
    name.focus();
  }

  function renderList(): void {
    list.replaceChildren();
    if (!skills.length) {
      const empty = document.createElement("div");
      empty.className = "damophus-skill-manager__empty";
      empty.textContent = labels.empty;
      list.append(empty);
      return;
    }
    for (const skill of skills) {
      const row = document.createElement("div");
      row.className = "damophus-skill-manager__item-row";
      const item = document.createElement("button");
      item.type = "button";
      item.className = "damophus-skill-manager__item";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(skill.name === selected));
      item.disabled = !installedNames.has(skill.name);
      const title = document.createElement("strong");
      title.textContent = skill.name;
      const badge = document.createElement("span");
      badge.className = "damophus-skill-manager__badge";
      badge.dataset.state = skill.state;
      badge.textContent = labels.states[skill.state];
      item.append(title, badge);
      item.addEventListener("click", () => void selectSkill(skill.name));
      row.append(item);
      if (skill.sourcePath && skill.state !== "unreadable") {
        const update = button(labels.update, "iconDownload", () => void syncOneSkill(skill.name));
        update.classList.add("damophus-skill-manager__update");
        row.append(update);
      }
      list.append(row);
    }
  }

  async function refreshSkills(): Promise<void> {
    try {
      const installed = (await operations.listSkills()) || [];
      installedNames = new Set(installed.map((skill) => skill.name));
      skills = await operations.inspectSkillSourceRoot(config.sourceRoot);
      renderList();
      if (selected && installedNames.has(selected)) await selectSkill(selected);
      else if (installed[0]) await selectSkill(installed[0].name);
      else createSkill();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  async function selectSkill(skillName: string): Promise<void> {
    try {
      const skill = await operations.getSkill(skillName);
      selected = skillName;
      name.value = skill.name;
      content.value = skill.content;
      renderList();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  async function saveCurrent(): Promise<void> {
    if (!name.value.trim()) return setStatus(labels.failed, true);
    try {
      await operations.saveSkill(name.value.trim(), content.value);
      selected = name.value.trim();
      setStatus(labels.saved);
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  async function renameCurrent(): Promise<void> {
    if (!selected || !name.value.trim() || selected === name.value.trim()) return;
    try {
      await operations.renameSkill(selected, name.value.trim());
      selected = name.value.trim();
      setStatus(labels.saved);
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  async function removeCurrent(): Promise<void> {
    if (!selected || !window.confirm(labels.confirmRemove)) return;
    try {
      await operations.removeSkill(selected);
      selected = "";
      setStatus(labels.saved);
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  async function syncOneSkill(skillName: string): Promise<void> {
    try {
      await operations.syncSkillFromRoot(config.sourceRoot, skillName, config.syncOptions);
      setStatus(`${labels.synced}: ${skillName}`);
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  async function syncAllSkills(): Promise<void> {
    try {
      const result = await operations.syncSkillSourceRoot(config.sourceRoot, config.onlyChanged, config.syncOptions);
      setStatus(labels.syncResult
        .replace("{synced}", String(result.synced))
        .replace("{skipped}", String(result.skipped))
        .replace("{unreadable}", String(result.unreadable)));
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  void refreshSkills();
  return () => target.replaceChildren();
}
