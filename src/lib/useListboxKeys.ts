import { useCallback } from "react";

/**
 * Keyboard handler for WAI-ARIA Listbox pattern.
 * Handles ArrowUp/ArrowDown/Home/End to move focus among `[role="option"]` children.
 */
export function useListboxKeys() {
  return useCallback((e: React.KeyboardEvent<HTMLUListElement>) => {
    const list = e.currentTarget;
    const options = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
    if (options.length === 0) return;

    const currentIdx = options.indexOf(document.activeElement as HTMLElement);

    let nextIdx: number | null = null;
    switch (e.key) {
      case "ArrowDown":
        nextIdx = currentIdx < options.length - 1 ? currentIdx + 1 : 0;
        break;
      case "ArrowUp":
        nextIdx = currentIdx > 0 ? currentIdx - 1 : options.length - 1;
        break;
      case "Home":
        nextIdx = 0;
        break;
      case "End":
        nextIdx = options.length - 1;
        break;
      default:
        return; // Don't prevent default for other keys
    }

    e.preventDefault();
    if (nextIdx !== null) options[nextIdx].focus();
  }, []);
}
