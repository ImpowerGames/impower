import AccessibleBrandsIcon from "../../../../resources/icons/brands/accessible-icon.svg";
import AwardSolidIcon from "../../../../resources/icons/solid/award.svg";
import HandPointerSolidIcon from "../../../../resources/icons/solid/hand-pointer.svg";
import HandshakeSolidIcon from "../../../../resources/icons/solid/handshake.svg";
import HeartPulseSolidIcon from "../../../../resources/icons/solid/heart-pulse.svg";
import ScaleBalancedSolidIcon from "../../../../resources/icons/solid/scale-balanced.svg";

interface GoalInfo {
  icon: string;
  color: string;
  title: string;
  description: string[];
}

export const goalsInfo = {
  image: "/images/illustrations/fogg-coffee-break.svg",
  title: `Our Core Principles & Goals`,
  goals: [
    {
      icon: HandPointerSolidIcon,
      color: "#ff6b6b",
      title: `Usability`,
      description: [
        `We believe that intuitive and user-friendly design is key to the development of game engines. The easier a tool is to use, the quicker it is for users to learn it and start using it effectively. However, many of the prominent game engines in the market today prioritize the desires of large Triple-A studios over the needs of small indie developers. This means that features which improve the usability and accessibility of games and game engines are often passed over in favor of "flashier" features that are more attractive to large corporations. We believe this trend in game engine design is limiting the creative potential and diversity of the game industry as a whole.`,
        `**Through Impower, we hope to craft a game engine that is easy to use for all sorts of people (even those without prior coding or game dev experience!)**`,
      ],
    },
    {
      icon: AccessibleBrandsIcon,
      color: "#51cf66",
      title: `Accessibility`,
      description: [
        `It is our belief that good usability inherently increases accessibility. Many contemporary game engines fail to consider the needs of developers and gamers who are differently abled. They often neglect providing basic accessibility features like subtitles, color palettes, audio channel management, and control customization in their game engine featureset, instead opting to offload the implementation of these features onto the developers who use their engines. By failing to provide users with an accessible engine and with the tools they need to make their own games accessible, we believe these game engines are limiting the reach of their toolset and the games they produce.`,
        `**By building accessibility features into our game engine, we hope to make games and game development accessible to a wider array of individuals from different backgrounds, experiences, and skillsets.**`,
      ],
    },
    {
      icon: HandshakeSolidIcon,
      color: "#fcc419",
      title: `Diversity`,
      description: [
        `We believe that diversity and representation are incredibly important in all forms of media. Though the audience for games have become increasingly diverse, the game industry itself has yet to see similar strides in the diversity of its own workforce and portrayals.`,
        `**By providing a place for developers to team up with others outside the bounds of traditional industry hiring practices, we hope to counteract this lack of diversity and broaden the reach of games and game development as a whole.**`,
      ],
    },
    {
      icon: ScaleBalancedSolidIcon,
      color: "#22b8cf",
      title: `Integrity`,
      description: [
        `Exploitation, toxicity, and abuse are currently rife in the game industry. In recent years, several industry scandals have highlighted the exploitative and abusive practices present in the industry today, yet little has been done to correct the behaviour of the corporations responsible for it.`,
        `**Through Impower, we aim to provide developers with a viable alternative to these predatory workplaces, giving them the means and tools necessary to make games on their own time and on their own terms.**`,
      ],
    },
    {
      icon: AwardSolidIcon,
      color: "#9775fa",
      title: `Quality`,
      description: [
        `The Impower storefront has a few simple rules in place to encourage the submission of higher quality games and discourage the use of potentially exploitative monetization tactics:`,
        `**#1 No lootboxes**\n(i.e. gambling mechanics that encourage players to pay real money for randomized virtual rewards)`,
        `**#2 No "pay-to-win" microtransactions**\n(i.e. mechanics that encourage players to pay real money for gameplay advantages)\n`,
        `**#3 No "pay-to-advance" microtransactions**\n(i.e. mechanics that encourage players to pay real money to advance the game)`,
        `**We believe that these monetization strategies are detrimental to the experience of many games and particularly harmful to those most vulnerable to predatory dark patterns.**`,
      ],
    },
    {
      icon: HeartPulseSolidIcon,
      color: "#f783ac",
      title: `Stability`,
      description: [
        `With several countries struggling to form a suitable response to the Covid-19 pandemic, we believe it is more important than ever for people to find alternative ways of maintaining safe and stable forms of employment.`,
        `**Through Impower, we hope to provide people with the tools they need to establish their own virtual game studios and make games with people from around the world. In this way, developers, artists, writers, musicians, voice actors, and people from all sorts of different fields can continue to work together in a productive and safe environment.**`,
      ],
    },
  ] as GoalInfo[],
};
