export function getModalFocusCycleTarget<T>(
  focusable: readonly T[],
  activeElement: T | null,
  shiftKey: boolean,
): T | null {
  if (focusable.length === 0 || activeElement === null) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1]!;

  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

export const modalFocusableSelector = [
  "a[href]:not([tabindex='-1'])",
  "button:not([disabled]):not([tabindex='-1'])",
  "input:not([disabled]):not([tabindex='-1'])",
  "select:not([disabled]):not([tabindex='-1'])",
  "textarea:not([disabled]):not([tabindex='-1'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getModalFocusCycleTargetInContainer(
  container: HTMLElement,
  activeElement: Element | null,
  shiftKey: boolean,
): HTMLElement | null {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(modalFocusableSelector))
    .filter((element) => element.getClientRects().length > 0);
  const activeFocusableElement = activeElement instanceof HTMLElement ? activeElement : null;
  return getModalFocusCycleTarget(focusable, activeFocusableElement, shiftKey);
}
