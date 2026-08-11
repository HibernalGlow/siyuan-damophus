import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import TableFitPlugin from "./index";
import pluginMetadata from "./plugin";
import {
  TABLE_FIT_CSS,
  TABLE_FIT_STYLE_ID,
  TableFitStyles,
} from "./table-fit";

const renderWideTable = () => {
  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  editor.style.width = "320px";
  editor.innerHTML = `
    <div data-type="NodeTable" class="table">
      <div>
        <table>
          <colgroup><col style="min-width:240px"><col style="width:360px"><col style="width:480px"></colgroup>
          <tbody><tr><td>Short</td><td>civil-procedure-jurisdiction-rule-without-spaces</td><td>Long explanation</td></tr></tbody>
        </table>
        <div class="protyle-action__table"><div class="table__resize"></div></div>
      </div>
    </div>`;
  document.body.append(editor);
  return {
    editor,
    container: editor.querySelector<HTMLElement>(".table > div")!,
  };
};

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById(TABLE_FIT_STYLE_ID)?.remove();
});

describe("table fit", () => {
  it("fits a wide native table to a narrow editor without horizontal scrolling", async () => {
    await page.viewport(390, 700);
    const hostStyle = document.createElement("style");
    hostStyle.textContent = `
      .protyle-wysiwyg .table > div:first-child { overflow: auto; }
      .protyle-wysiwyg .table table { display: inline-block; width: max-content; border-collapse: collapse; }
      .protyle-wysiwyg .table td { padding: 4px 8px; white-space: nowrap; }
    `;
    document.head.append(hostStyle);
    const { editor, container } = renderWideTable();
    expect(editor.scrollWidth).toBeGreaterThan(editor.clientWidth);

    const styles = new TableFitStyles(document);
    styles.start();

    const table = container.querySelector<HTMLTableElement>("table")!;
    const longCell = container.querySelectorAll<HTMLTableCellElement>("td")[1];
    expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
    expect(Math.round(table.getBoundingClientRect().width)).toBe(container.clientWidth);
    expect(getComputedStyle(table).tableLayout).toBe("fixed");
    expect(longCell.scrollWidth).toBeLessThanOrEqual(longCell.clientWidth);
    expect(getComputedStyle(container.querySelector<HTMLElement>(".table__resize")!).display).toBe("none");

    styles.destroy();
    hostStyle.remove();
  });

  it("mounts once and removes only its own style node", () => {
    const unrelated = document.createElement("style");
    unrelated.id = "unrelated-style";
    document.head.append(unrelated);
    const styles = new TableFitStyles(document);

    styles.start();
    styles.start();
    expect(document.querySelectorAll(`#${TABLE_FIT_STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(TABLE_FIT_STYLE_ID)?.textContent).toBe(TABLE_FIT_CSS);

    styles.destroy();
    expect(document.getElementById(TABLE_FIT_STYLE_ID)).toBeNull();
    expect(document.getElementById("unrelated-style")).toBe(unrelated);
    unrelated.remove();
  });

  it("toggles the persisted layout setting immediately from the plugin menu", () => {
    let fitEnabled = true;
    const setSetting = vi.fn((key: string, value: boolean) => {
      if (key === "fitEnabled") fitEnabled = value;
    });
    const plugin = new TableFitPlugin();
    plugin.getSetting = () => fitEnabled;
    plugin.setSetting = setSetting;
    plugin.t = () => "Responsive Tables";
    plugin.onload();

    const addItem = vi.fn();
    plugin.addMenuItem({ addItem } as never);
    const enabledItem = addItem.mock.calls[0][0];
    expect(enabledItem).toMatchObject({
      icon: "iconTable",
      label: "Responsive Tables",
      checked: true,
    });

    enabledItem.click();
    expect(setSetting).toHaveBeenLastCalledWith("fitEnabled", false);
    expect(document.getElementById(TABLE_FIT_STYLE_ID)).toBeNull();

    addItem.mockClear();
    plugin.addMenuItem({ addItem } as never);
    const disabledItem = addItem.mock.calls[0][0];
    expect(disabledItem.checked).toBe(false);
    disabledItem.click();
    expect(setSetting).toHaveBeenLastCalledWith("fitEnabled", true);
    expect(document.getElementById(TABLE_FIT_STYLE_ID)).not.toBeNull();

    plugin.onunload();
  });

  it("declares the quick toggle as enabled by default", () => {
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "fitEnabled",
      type: "checkbox",
      value: true,
    }));
  });
});
