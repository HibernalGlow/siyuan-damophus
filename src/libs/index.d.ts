type TSettingItemType =
  | "checkbox"
  | "select"
  | "textinput"
  | "textarea"
  | "number"
  | "slider"
  | "button"
  | "hint"
  | "list"
  | "excludedRules"
  | "blockTypes";
interface ISettingItem {
  key: string;
  value: any;
  type: TSettingItemType;
  title: string;
  description?: string;
  icon?: import("./plugin-icons").PluginIconName;
  entrySurface?: import("./plugin-entry-settings").ConfigurableEntrySurface;
  entryManagement?: "central";
  placeholder?: string;
  height?: string;
  slider?: {
    min: number;
    max: number;
    step: number;
  };
  options?: { [key: string | number]: string };
  columns?: Array<{
    key: string;
    title: string;
    type: "text" | "number" | "select" | "notebook" | "emoji";
    width?: string;
    options?: Record<string, string>;
  }>;
  button?: {
    label: string;
    callback: () => void;
  };
}
