export type TourTargetId =
  | 'nav-dashboard'
  | 'fab-quick-add'
  | 'nav-accounts'
  | 'nav-expenses'
  | 'nav-transactions'
  | 'nav-history'
  | 'nav-reconciliation'
  | 'nav-portability';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TooltipPlacement = 'right' | 'left' | 'top' | 'bottom' | 'center';

export interface TooltipLayout {
  left: number;
  top: number;
  width: number;
  placement: TooltipPlacement;
  arrowOffset: number;
}

export interface ViewportInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Computes a padded spotlight cutout rect clamped within viewport bounds.
 */
export function computeSpotlightRect(
  target: Rect,
  viewportWidth: number,
  viewportHeight: number,
  padding = 4,
): Rect {
  const left = clamp(target.x - padding, 0, viewportWidth);
  const top = clamp(target.y - padding, 0, viewportHeight);
  const right = clamp(target.x + target.width + padding, left, viewportWidth);
  const bottom = clamp(target.y + target.height + padding, top, viewportHeight);

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Computes the target anchor point where the animated pointer cursor lands.
 */
export function computeCursorAnchor(
  target: Rect,
  targetId: TourTargetId,
): { x: number; y: number } {
  if (targetId === 'fab-quick-add') {
    return {
      x: target.x + target.width * 0.5,
      y: target.y + target.height * 0.5,
    };
  }

  return {
    x: target.x + Math.max(target.width - 24, target.width * 0.72),
    y: target.y + target.height * 0.5,
  };
}

/**
 * Computes directional tooltip placement, clamped viewport coordinates, and caret offset.
 */
export function computeTooltipLayout(params: {
  target: Rect | null;
  targetId: TourTargetId;
  isDesktop: boolean;
  viewportWidth: number;
  viewportHeight: number;
  tooltipHeight: number;
  insets: ViewportInsets;
}): TooltipLayout {
  const {
    target,
    targetId,
    isDesktop,
    viewportWidth,
    viewportHeight,
    tooltipHeight,
    insets,
  } = params;

  const margin = 16;
  const gap = 14;
  const caretInset = 24;

  const safeLeft = insets.left + margin;
  const safeRight = viewportWidth - insets.right - margin;
  const availableWidth = Math.max(220, safeRight - safeLeft);

  const tooltipWidth = isDesktop
    ? Math.min(360, availableWidth)
    : Math.min(360, Math.max(Math.min(260, availableWidth), availableWidth));

  const minLeft = safeLeft;
  const maxLeft = Math.max(minLeft, safeRight - tooltipWidth);
  const minTop = insets.top + margin;
  const maxBottom = Math.max(minTop + 100, viewportHeight - insets.bottom - margin);
  const maxTop = Math.max(minTop, maxBottom - tooltipHeight);

  if (!target) {
    const centeredLeft = clamp(
      (viewportWidth - tooltipWidth) / 2,
      minLeft,
      maxLeft,
    );
    const centeredTop = clamp(
      (viewportHeight - tooltipHeight) / 2,
      minTop,
      maxTop,
    );
    return {
      left: centeredLeft,
      top: centeredTop,
      width: tooltipWidth,
      placement: 'center',
      arrowOffset: 0,
    };
  }

  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;

  if (targetId === 'fab-quick-add') {
    const topCandidate = target.y - gap - tooltipHeight;
    if (topCandidate >= minTop || !isDesktop) {
      const left = clamp(
        target.x + target.width - tooltipWidth,
        minLeft,
        maxLeft,
      );
      const top = clamp(topCandidate, minTop, maxTop);
      const arrowOffset = clamp(
        targetCenterX - left,
        caretInset,
        Math.max(caretInset, tooltipWidth - caretInset),
      );
      return {
        left,
        top,
        width: tooltipWidth,
        placement: 'top',
        arrowOffset,
      };
    }

    const left = clamp(target.x - gap - tooltipWidth, minLeft, maxLeft);
    const top = clamp(targetCenterY - tooltipHeight / 2, minTop, maxTop);
    const arrowOffset = clamp(
      targetCenterY - top,
      caretInset,
      Math.max(caretInset, tooltipHeight - caretInset),
    );
    return {
      left,
      top,
      width: tooltipWidth,
      placement: 'left',
      arrowOffset,
    };
  }

  if (isDesktop) {
    const left = clamp(target.x + target.width + gap, minLeft, maxLeft);
    const top = clamp(targetCenterY - tooltipHeight / 2, minTop, maxTop);
    const arrowOffset = clamp(
      targetCenterY - top,
      caretInset,
      Math.max(caretInset, tooltipHeight - caretInset),
    );
    return {
      left,
      top,
      width: tooltipWidth,
      placement: 'right',
      arrowOffset,
    };
  }

  const spaceBelow = maxBottom - (target.y + target.height + gap);
  const spaceAbove = target.y - gap - minTop;
  const placeBelow = spaceBelow >= tooltipHeight || spaceBelow >= spaceAbove;

  const left = clamp(
    viewportWidth > tooltipWidth + margin * 2
      ? (viewportWidth - tooltipWidth) / 2
      : safeLeft,
    minLeft,
    maxLeft,
  );
  const top = placeBelow
    ? clamp(target.y + target.height + gap, minTop, maxTop)
    : clamp(target.y - gap - tooltipHeight, minTop, maxTop);

  const arrowOffset = clamp(
    targetCenterX - left,
    caretInset,
    Math.max(caretInset, tooltipWidth - caretInset),
  );

  return {
    left,
    top,
    width: tooltipWidth,
    placement: placeBelow ? 'bottom' : 'top',
    arrowOffset,
  };
}
