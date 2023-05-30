export const nextAnimationFrame = async (): Promise<void> => {
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
};
