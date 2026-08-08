import { getSkill, listSkills, removeSkill, renameSkill, saveSkill, syncSkillDirectory, type SkillDocument, type SkillSummary } from "./api";

export interface SkillManagerLabels {
  title: string;
  refresh: string;
  source: string;
  sourcePlaceholder: string;
  sync: string;
  newSkill: string;
  nameOptional: string;
  select: string;
  content: string;
  save: string;
  rename: string;
  remove: string;
  empty: string;
  saved: string;
  synced: string;
  failed: string;
  confirmRemove: string;
}

export interface SkillManagerOperations {
  listSkills(): Promise<SkillSummary[] | null>;
  getSkill(name: string): Promise<SkillDocument>;
  saveSkill(name: string, content: string): Promise<void>;
  renameSkill(oldName: string, newName: string): Promise<void>;
  removeSkill(name: string): Promise<void>;
  syncSkillDirectory(source: string, requestedName?: string): Promise<{ name: string }>;
}

const defaultOperations: SkillManagerOperations = {
  listSkills,
  getSkill,
  saveSkill,
  renameSkill,
  removeSkill,
  syncSkillDirectory,
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
  operations: SkillManagerOperations = defaultOperations,
): () => void {
  let skills: SkillSummary[] = [];
  let selected = "";
  const root = document.createElement("section");
  root.className = "damophus-skill-manager";
  root.setAttribute("aria-label", labels.title);

  const toolbar = document.createElement("header");
  toolbar.className = "damophus-skill-manager__toolbar";
  const heading = document.createElement("h2");
  heading.textContent = labels.title;
  const create = button(labels.newSkill, "iconAdd", () => createSkill());
  const refresh = button(labels.refresh, "iconRefresh", () => void refreshSkills());
  toolbar.append(heading, create, refresh);

  const sync = document.createElement("div");
  sync.className = "damophus-skill-manager__sync";
  const source = document.createElement("input");
  source.className = "b3-text-field";
  source.type = "text";
  source.placeholder = labels.sourcePlaceholder;
  source.setAttribute("aria-label", labels.source);
  const syncName = document.createElement("input");
  syncName.className = "b3-text-field";
  syncName.type = "text";
  syncName.placeholder = labels.nameOptional;
  syncName.setAttribute("aria-label", labels.nameOptional);
  const syncButton = button(labels.sync, "iconUpload", () => void syncFromPath());
  sync.append(source, syncName, syncButton);

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
  root.append(toolbar, sync, body, status);
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
      const item = document.createElement("button");
      item.type = "button";
      item.className = "damophus-skill-manager__item";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(skill.name === selected));
      const title = document.createElement("strong");
      title.textContent = skill.name;
      const description = document.createElement("span");
      description.textContent = skill.description;
      item.append(title, description);
      item.addEventListener("click", () => void selectSkill(skill.name));
      list.append(item);
    }
  }

  async function refreshSkills(): Promise<void> {
    try {
      skills = (await operations.listSkills()) || [];
      renderList();
      if (selected && skills.some((skill) => skill.name === selected)) await selectSkill(selected);
      else if (skills[0]) await selectSkill(skills[0].name);
      else {
        selected = "";
        name.value = "";
        content.value = "";
      }
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

  async function syncFromPath(): Promise<void> {
    if (!source.value.trim()) return setStatus(labels.failed, true);
    try {
      const result = await operations.syncSkillDirectory(source.value.trim(), syncName.value.trim() || undefined);
      setStatus(`${labels.synced}: ${result.name}`);
      await refreshSkills();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  void refreshSkills();
  return () => {
    target.replaceChildren();
  };
}
