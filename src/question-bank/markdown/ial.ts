export type IalAttributes = Record<string, string>;

export interface IalParseResult {
  attributes: IalAttributes;
  errors: string[];
}

const keyPattern = /[A-Za-z0-9_-]/;

export function parseIal(input: string): IalParseResult | null {
  const source = input.trim();
  if (!source.startsWith("{:")) return null;
  if (!source.endsWith("}")) {
    return { attributes: {}, errors: ["IAL is missing its closing brace"] };
  }

  const attributes: IalAttributes = {};
  const errors: string[] = [];
  const body = source.slice(2, -1);
  let index = 0;

  while (index < body.length) {
    while (/\s/.test(body[index] ?? "")) index += 1;
    if (index >= body.length) break;

    const keyStart = index;
    while (keyPattern.test(body[index] ?? "")) index += 1;
    const key = body.slice(keyStart, index);
    if (!key) {
      errors.push(`Unexpected token at column ${index + 3}`);
      break;
    }

    while (/\s/.test(body[index] ?? "")) index += 1;
    if (body[index] !== "=") {
      errors.push(`Attribute ${key} is missing '='`);
      break;
    }
    index += 1;
    while (/\s/.test(body[index] ?? "")) index += 1;

    const quote = body[index];
    if (quote !== '"' && quote !== "'") {
      errors.push(`Attribute ${key} must use a quoted value`);
      break;
    }
    index += 1;

    let value = "";
    let closed = false;
    while (index < body.length) {
      const character = body[index];
      if (character === "\\") {
        const escaped = body[index + 1];
        if (escaped === undefined) break;
        value += escaped;
        index += 2;
        continue;
      }
      if (character === quote) {
        index += 1;
        closed = true;
        break;
      }
      value += character;
      index += 1;
    }
    if (!closed) {
      errors.push(`Attribute ${key} has an unterminated value`);
      break;
    }
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      errors.push(`Attribute ${key} is duplicated`);
    }
    attributes[key] = value;
  }

  return { attributes, errors };
}

export function serializeIal(attributes: Readonly<IalAttributes>): string {
  const fields = Object.entries(attributes).map(([key, value]) => {
    if (!key || [...key].some((character) => !keyPattern.test(character))) {
      throw new Error(`Invalid IAL attribute key: ${key}`);
    }
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `${key}="${escaped}"`;
  });
  return `{: ${fields.join(" ")}}`;
}
