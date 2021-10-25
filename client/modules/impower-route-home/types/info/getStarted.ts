interface ButtonInfo {
  action: string;
  description: string;
  link: string;
}

export const getStartedInfo = {
  image: "/images/illustrations/fogg-premium-upgrade-1.svg",
  title: `Ready to get started?`,
  buttons: [
    { action: `Pitch`, description: `games.`, link: "/pitch" },
    { action: `Make`, description: `games.`, link: "/dashboard" },
  ] as ButtonInfo[],
};
