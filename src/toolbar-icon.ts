export function prepareToolbarIcon(rawSvg: string): string {
  return rawSvg
    .replace(/^<\?xml[^>]*>\s*/u, "")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gu, "")
    .replace(/\s+role="img"/gu, "")
    .replace(/\s+aria-labelledby="[^"]*"/gu, "")
    .replace(/>\s+</gu, "><")
    .replace("<svg", '<svg aria-hidden="true" focusable="false"')
    .trim();
}
