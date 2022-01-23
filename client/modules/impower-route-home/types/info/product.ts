import BullhornSolidIcon from "../../../../resources/icons/solid/bullhorn.svg";
import ScrewdriverWrenchSolidIcon from "../../../../resources/icons/solid/screwdriver-wrench.svg";
import StoreSolidIcon from "../../../../resources/icons/solid/store.svg";
import UsersSolidIcon from "../../../../resources/icons/solid/users.svg";

interface StepInfo {
  icon: string;
  description: string;
  caption: string;
  color: string;
  link: string;
}

export const productInfo = {
  image: "/images/illustrations/fogg-5.svg",
  title: `Make your game a reality.`,
  steps: [
    {
      icon: BullhornSolidIcon,
      description: "Pitch a game",
      caption: "that you'd like to make or play",
      color: "#f06595",
      link: "/pitch/game",
    },
    {
      icon: UsersSolidIcon,
      description: "Form a studio",
      caption:
        "with talented designers, artists, writers and other creative people",
      color: "#20c997",
      link: "/directory?t=studios",
    },
    {
      icon: StoreSolidIcon,
      description: "Browse for assets",
      caption: "in our creative commons asset library",
      color: "#339af0",
      link: "/library",
    },
    {
      icon: ScrewdriverWrenchSolidIcon,
      description: "Build your game",
      caption:
        "using our intuitive drag-and-drop visual engine.\nNo coding required!",
      color: "#ff922b",
      link: "/engine",
    },
  ] as StepInfo[],
};
