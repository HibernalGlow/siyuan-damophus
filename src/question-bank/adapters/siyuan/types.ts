export type AttributeViewKeyType =
  | "block"
  | "text"
  | "number"
  | "date"
  | "select"
  | "mSelect"
  | "url"
  | "email"
  | "phone"
  | "mAsset"
  | "template"
  | "created"
  | "updated"
  | "checkbox"
  | "relation"
  | "rollup"
  | "lineNumber";

export interface AttributeViewKey {
  id: string;
  name: string;
  type: AttributeViewKeyType;
  options?: Array<{
    name: string;
    color: string;
    desc?: string;
  }>;
  relation?: {
    avID?: string;
    backKeyID?: string;
    isTwoWay?: boolean;
  };
  rollup?: {
    relationKeyID?: string;
    keyID?: string;
    calc?: { operator?: string };
  };
}

export interface AttributeViewValue {
  id?: string;
  keyID: string;
  blockID: string;
  type: AttributeViewKeyType;
  isDetached?: boolean;
  block?: { id?: string; content?: string };
  text?: { content?: string };
  number?: { content?: number; isNotEmpty?: boolean };
  date?: { content?: number; isNotEmpty?: boolean };
  mSelect?: Array<{ content: string; color: string }>;
  mAsset?: Array<{ content: string; name: string; type: "file" | "image" }>;
  checkbox?: { checked?: boolean };
  relation?: { blockIDs: string[]; contents?: AttributeViewValue[] };
}

export interface AttributeViewKeyValues {
  key: AttributeViewKey;
  values: AttributeViewValue[];
}

export interface RawAttributeView {
  id: string;
  name?: string;
  viewID?: string;
  keyValues: AttributeViewKeyValues[];
}

export interface AttributeViewResponse {
  av: RawAttributeView;
}

export interface SiyuanKernelClient {
  request<T>(endpoint: string, payload: unknown): Promise<T>;
}

export type NodeIdGenerator = () => string;
