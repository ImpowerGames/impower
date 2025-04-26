const locks = new Set();

/** Returns the width of the document's scrollbar */
const getScrollbarWidth = () => {
  const documentWidth = document.documentElement.clientWidth;
  return Math.abs(window.innerWidth - documentWidth);
};

/**
 * Prevents body scrolling. Keeps track of which elements requested a lock so multiple levels of locking are possible
 * without premature unlocking.
 */
export const lockBodyScrolling = (lockingEl: HTMLElement) => {
  locks.add(lockingEl);

  // When the first lock is created, set the scroll lock size to match the scrollbar's width to prevent content from
  // shifting. We only do this on the first lock because the scrollbar width will measure zero after overflow is hidden.
  if (!document.documentElement.classList.contains("s-scroll-lock")) {
    const scrollbarWidth = getScrollbarWidth(); // must be measured before the `s-scroll-lock` class is applied
    document.documentElement.classList.add("s-scroll-lock");
    document.documentElement.style.setProperty(
      "--theme_scroll-lock-size",
      `${scrollbarWidth}px`
    );
  }
};

/**
 * Unlocks body scrolling. Scrolling will only be unlocked once all elements that requested a lock call this method.
 */
export const unlockBodyScrolling = (lockingEl: HTMLElement) => {
  locks.delete(lockingEl);

  if (locks.size === 0) {
    document.documentElement.classList.remove("s-scroll-lock");
    document.documentElement.style.removeProperty("--theme_scroll-lock-size");
  }
};
