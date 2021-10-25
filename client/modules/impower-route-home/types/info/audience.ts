import ComputerMouseSolidIcon from "../../../../resources/icons/solid/computer-mouse.svg";
import PaintBrushSolidIcon from "../../../../resources/icons/solid/paint-brush.svg";
import PencilSolidIcon from "../../../../resources/icons/solid/pencil.svg";
import StarsSolidIcon from "../../../../resources/icons/solid/stars.svg";
import ViolinSolidIcon from "../../../../resources/icons/solid/violin.svg";

interface UserInfo {
  icon: string;
  description: string;
  link: string;
}

export const audienceInfo = {
  image: "/images/illustrations/clip-1-diverse.svg",
  title: `Who is Impower for?`,
  buttons: [
    {
      icon: ComputerMouseSolidIcon,
      description: "Developers",
      link: "/teams",
    },
    {
      icon: PaintBrushSolidIcon,
      description: "Artists",
      link: "/teams",
    },
    {
      icon: PencilSolidIcon,
      description: "Writers",
      link: "/teams",
    },
    {
      icon: ViolinSolidIcon,
      description: "Composers",
      link: "/teams",
    },
    {
      icon: StarsSolidIcon,
      description: "And more!",
      link: "/teams",
    },
  ] as UserInfo[],
  caption:
    "We believe that with the right tools, all sorts of people can work together to make amazing things!",
};
