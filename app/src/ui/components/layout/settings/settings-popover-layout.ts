const POP_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;
const MAX_WIDTH_PX = 384; // 24rem
const MIN_WIDTH_PX = 200;
const MAX_HEIGHT_PX = 46 * 16;
const MIN_HEIGHT_PX = 120;
const FLIP_THRESHOLD_PX = 220;

export function layoutSettingsPopover(
  pop: HTMLElement,
  anchor: HTMLElement,
  dialog: HTMLElement | null,
): void {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const anchorRect = anchor.getBoundingClientRect();

  let width = Math.min(MAX_WIDTH_PX, viewportWidth - VIEWPORT_MARGIN_PX * 2);
  let left = anchorRect.left;

  if (left + width > viewportWidth - VIEWPORT_MARGIN_PX) {
    left = viewportWidth - VIEWPORT_MARGIN_PX - width;
  }
  if (left < VIEWPORT_MARGIN_PX) {
    left = VIEWPORT_MARGIN_PX;
    width = Math.min(width, viewportWidth - VIEWPORT_MARGIN_PX * 2);
  }
  width = Math.max(MIN_WIDTH_PX, Math.floor(width));

  const belowTop = anchorRect.bottom + POP_GAP_PX;
  let availableHeight = viewportHeight - VIEWPORT_MARGIN_PX - belowTop;
  let flip = false;

  if (availableHeight < FLIP_THRESHOLD_PX) {
    const aboveHeight = anchorRect.top - VIEWPORT_MARGIN_PX - POP_GAP_PX;
    if (aboveHeight > availableHeight) {
      flip = true;
      availableHeight = aboveHeight;
    }
  }

  pop.classList.add('is-viewport-docked');
  pop.style.setProperty('--p-settings-pop-left', `${Math.round(left)}px`);
  pop.style.setProperty('--p-settings-pop-width', `${width}px`);

  if (flip) {
    pop.classList.add('is-flipped');
    pop.style.removeProperty('--p-settings-pop-top');
    pop.style.setProperty(
      '--p-settings-pop-bottom',
      `${Math.round(viewportHeight - anchorRect.top + POP_GAP_PX)}px`,
    );
  } else {
    pop.classList.remove('is-flipped');
    pop.style.setProperty('--p-settings-pop-top', `${Math.round(belowTop)}px`);
    pop.style.removeProperty('--p-settings-pop-bottom');
  }

  const maxHeight = Math.max(MIN_HEIGHT_PX, Math.min(MAX_HEIGHT_PX, Math.floor(availableHeight)));
  dialog?.style.setProperty('--p-settings-max-height', `${maxHeight}px`);
}

export function clearSettingsPopoverLayout(pop: HTMLElement, dialog: HTMLElement | null): void {
  pop.classList.remove('is-viewport-docked', 'is-flipped');
  pop.style.removeProperty('--p-settings-pop-left');
  pop.style.removeProperty('--p-settings-pop-top');
  pop.style.removeProperty('--p-settings-pop-bottom');
  pop.style.removeProperty('--p-settings-pop-width');
  dialog?.style.removeProperty('--p-settings-max-height');
}
