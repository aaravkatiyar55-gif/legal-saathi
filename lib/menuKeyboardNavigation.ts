type MenuFocusableItem = {
  disabled?: boolean;
};

/**
 * Returns the next enabled item index for the conventional menu keys. The
 * caller owns DOM focus, which keeps this helper usable in DOM-free tests.
 */
export function getMenuFocusIndex(
  items: readonly MenuFocusableItem[],
  activeIndex: number,
  key: string,
): number | null {
  const enabledIndexes = items.flatMap((item, index) => item.disabled ? [] : [index]);
  if (enabledIndexes.length === 0) return null;
  if (key === "Home") return enabledIndexes[0];
  if (key === "End") return enabledIndexes[enabledIndexes.length - 1];
  if (key !== "ArrowDown" && key !== "ArrowUp") return null;

  const currentPosition = enabledIndexes.indexOf(activeIndex);
  if (currentPosition === -1) {
    return key === "ArrowDown" ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
  }

  const offset = key === "ArrowDown" ? 1 : -1;
  return enabledIndexes[(currentPosition + offset + enabledIndexes.length) % enabledIndexes.length];
}
