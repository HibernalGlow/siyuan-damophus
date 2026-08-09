export function renderSkillMarkdown(markdown: string): string {
  const lute = window.Lute.New();
  lute.SetProtyleWYSIWYG(true);
  lute.SetKramdownIAL(true);
  lute.SetTextMark(true);
  lute.SetTag(true);
  lute.SetSuperBlock(true);
  lute.SetInlineMath(true);
  lute.SetGFMStrikethrough(true);
  lute.SetSanitize(true);
  return lute.Md2BlockDOM(markdown);
}
