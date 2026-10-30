const locks = new Set();

const getScrollbarWidth = () => {
  const documentWidth = document.documentElement.clientWidth;
  return Math.abs(window.innerWidth - documentWidth);
};

export const lockBodyScrolling = (lockingEl: HTMLElement) => {
  locks.add(lockingEl);

  if (!document.documentElement.classList.contains("s-scroll-lock")) {
    const scrollbarWidth = getScrollbarWidth();
    document.documentElement.classList.add("s-scroll-lock");
    document.documentElement.style.setProperty(
      "--theme-scroll-lock-size",
      `${scrollbarWidth}px`,
    );
  }
};

export const unlockBodyScrolling = (lockingEl: HTMLElement) => {
  locks.delete(lockingEl);

  if (locks.size === 0) {
    document.documentElement.classList.remove("s-scroll-lock");
    document.documentElement.style.removeProperty("--theme-scroll-lock-size");
  }
};
