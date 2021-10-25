interface ButtonInfo {
  action: string;
  description: string;
  link: string;
}

export const getStartedInfo = {
  image: "/images/illustrations/fogg-premium-upgrade-1.svg",
  title: `Ready to get started?`,
  buttons: [
    { action: `Pitch`, description: `games.`, link: "/pitch?e=game" },
    { action: `Make`, description: `games.`, link: "/pitch" },
  ] as ButtonInfo[],
};
