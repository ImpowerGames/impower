interface FeatureInfo {
  description: string;
  supported?: string;
}

interface FeaturesetInfo {
  title: string;
  subheader?: string;
  features: FeatureInfo[];
}

export const roadmapInfo = {
  image: "/images/illustrations/clip-message-sent-1.svg",
  title: `What's next?`,
  description: `Impower already has a lot of features that we feel developers will find useful. However, we are hard at work expanding our current featureset to support an even wider variety of game genres and creators.`,
  legend: `[✓] = Publicly Released\n\n[A] = Available To Alpha Testers`,
  caption: `You can suggest features you'd like supported next on our [issue board](https://github.com/ImpowerGames/impower/issues)!`,
  featuresets: [
    {
      title: "Game Genre Roadmap",
      features: [
        {
          description: "2D Story Games (aka Visual Novels)",
          supported: "A",
        },
        {
          description: "2D Puzzle Games",
          supported: "A",
        },
        {
          description: "2D Point-And-Click Adventure Games",
          supported: "A",
        },
        {
          description: "2D Top down RPGs",
        },
        {
          description: "2D Action Games",
        },
        {
          description: "2D Platformers",
        },
        {
          description: "3D Games",
        },
        {
          description: "And more!",
        },
      ] as FeatureInfo[],
    },
    {
      title: "Development Platform Roadmap",
      features: [
        {
          description: "Pitch Board",
          supported: "✓",
        },
        {
          description: "Studios",
          supported: "A",
        },
        {
          description: "Creative Commons Asset Library",
          supported: "A",
        },
        {
          description: "Collaborative Visual Game Engine",
          supported: "A",
        },
        {
          description: "Real time collaboration features",
          supported: "A",
        },
        {
          description: "Monthly Game Jams",
        },
        {
          description:
            "Tool Integrations (Github, Trello, Slack, itch.io, etc)",
        },
        {
          description: "Monetary Integrations (Patreon, Kickstarter, etc)",
        },
        {
          description: "Full-time Asset Creators",
        },
        {
          description: "Official Asset Packs",
        },
        {
          description: "Community Playtester Tools",
        },
        {
          description: "Community Translation Tools",
        },
        {
          description: "And more!",
        },
      ] as FeatureInfo[],
    },
  ] as FeaturesetInfo[],
};
