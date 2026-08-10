import { sanitizeCustomPropertyStyle } from "@/lets-block-attr/custom-properties";

export function buildTopicRelationStyles(customStyle: unknown): string {
  const safeCustomStyle = sanitizeCustomPropertyStyle(customStyle);
  const customDeclarations = safeCustomStyle
    ? `\n  ${safeCustomStyle.replace(/\n/gu, "\n  ")}`
    : "";
  return `.damophus-topic-relations {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  container-type: inline-size;
  container-name: damophus-topic-relations;
  margin: 3px 0 2px;
  padding: 2px 0 2px 8px;
  border: 0;
  border-left: 2px solid var(--b3-theme-primary, #3573f0);
  border-radius: 0;
  background: transparent;
  color: var(--b3-theme-on-surface, #202124);
  font-size: 12px;
  line-height: 1.65;
  letter-spacing: 0;
  position: static !important;
  inset: auto !important;
  transform: none !important;
  float: none !important;${customDeclarations}
}

.damophus-topic-relations__row,
.damophus-topic-relations__expanded-group {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 4px;
  min-width: 0;
}

.damophus-topic-relations__label,
.damophus-topic-relations__expanded-label,
.damophus-topic-relations__topic-heading {
  color: var(--b3-theme-on-surface-light, #5f6368);
  font-weight: 600;
}

.damophus-topic-relations__topic-heading {
  margin-top: 4px;
}

.damophus-topic-relations__separator {
  color: var(--b3-border-color, #dfe1e5);
  user-select: none;
}

.damophus-topic-relations__native-link,
.damophus-topic-relations__topic-button {
  max-width: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--b3-theme-primary, #3573f0);
  font: inherit;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.damophus-topic-relations__native-link:hover,
.damophus-topic-relations__topic-button:hover,
.damophus-topic-relations__native-link:focus-visible,
.damophus-topic-relations__topic-button:focus-visible {
  text-decoration: underline;
  outline: none;
}

.damophus-topic-relations__count-button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--b3-theme-on-surface-light, #5f6368);
  font-size: 11px;
  white-space: nowrap;
}

.damophus-topic-relations__count-button svg {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
}

.damophus-topic-relations__count-number {
  font-variant-numeric: tabular-nums;
}

@container damophus-topic-relations (max-width: 420px) {
  .damophus-topic-relations__count-label {
    display: none;
  }
}

.damophus-topic-relations__expanded-group {
  padding-left: 8px;
}

.damophus-topic-relations__expanded-links {
  min-width: 0;
}

.damophus-topic-relations__status--error {
  color: var(--b3-card-error-color, #d23f31);
}

.damophus-topic-relations__overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
}

.damophus-topic-relations__panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  width: min(52vw, 720px);
  max-width: calc(100vw - 24px);
  max-height: min(70dvh, 760px);
  overflow: hidden;
  border: 1px solid var(--b3-border-color, #dfe1e5);
  border-radius: 8px;
  background: var(--b3-theme-background, #fff);
  color: var(--b3-theme-on-background, #202124);
  box-shadow: var(--b3-dialog-shadow, 0 8px 28px rgba(0, 0, 0, 0.18));
  pointer-events: auto;
}

.damophus-topic-relations__overlay--mobile {
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.28);
  pointer-events: auto;
}

.damophus-topic-relations__panel--mobile {
  position: relative;
  inset: auto;
  width: 100%;
  max-width: none;
  height: min(var(--damophus-topic-mobile-height, 72dvh), calc(100dvh - env(safe-area-inset-top) - 16px));
  max-height: calc(100dvh - env(safe-area-inset-top) - 16px);
  border-width: 1px 0 0;
  border-radius: 8px 8px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}

.damophus-topic-relations__panel-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--b3-border-color, #dfe1e5);
}

.damophus-topic-relations__panel-header h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 15px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.damophus-topic-relations__panel-actions {
  display: flex;
  gap: 2px;
}

.damophus-topic-relations__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--b3-theme-on-surface, #202124);
  cursor: pointer;
}

.damophus-topic-relations__icon-button:hover,
.damophus-topic-relations__icon-button:focus-visible,
.damophus-topic-relations__icon-button[aria-pressed="true"] {
  background: var(--b3-list-hover, rgba(0, 0, 0, 0.06));
  outline: none;
}

.damophus-topic-relations__icon-button svg {
  width: 16px;
  height: 16px;
}

.damophus-topic-relations__panel-content {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.damophus-topic-relations__panel-group {
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--b3-border-color, #dfe1e5);
}

.damophus-topic-relations__panel-group:last-child {
  border-bottom: 0;
}

.damophus-topic-relations__panel-group[data-selected="true"] h3 {
  color: var(--b3-theme-primary, #3573f0);
}

.damophus-topic-relations__panel-group h3 {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.4;
}

.damophus-topic-relations__list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.damophus-topic-relations__list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
  padding: 7px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color, #dfe1e5) 65%, transparent);
}

.damophus-topic-relations__list-item:last-child {
  border-bottom: 0;
}

.damophus-topic-relations__path,
.damophus-topic-relations__empty {
  color: var(--b3-theme-on-surface-light, #5f6368);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .damophus-topic-relations {
    width: 100%;
  }
}`;
}
