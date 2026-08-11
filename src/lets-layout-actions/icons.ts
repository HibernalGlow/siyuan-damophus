export const PANEL_LAYOUT_ICON_SYMBOLS = `
<symbol id="iconDamophusPanelLeftClose" viewBox="0 0 24 24">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </g>
</symbol>
<symbol id="iconDamophusPanelRightClose" viewBox="0 0 24 24">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
    <path d="m8 9 3 3-3 3" />
  </g>
</symbol>
<symbol id="iconDamophusPanelBottomClose" viewBox="0 0 24 24">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 15h18" />
    <path d="m15 8-3 3-3-3" />
  </g>
</symbol>`;

export const PANEL_LAYOUT_ICONS = {
  switchLeftDock: "iconDamophusPanelLeftClose",
  switchRightDock: "iconDamophusPanelRightClose",
  switchBottomDock: "iconDamophusPanelBottomClose",
} as const;
