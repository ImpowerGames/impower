import FlagRegularIcon from "../../../resources/icons/regular/flag.svg";
import PenToSquareRegularIcon from "../../../resources/icons/regular/pen-to-square.svg";
import TrashCanRegularIcon from "../../../resources/icons/regular/trash-can.svg";
import getPitchShareOptions from "./getPitchShareOptions";

const getPitchPostOptions = (props: {
  delisted?: boolean;
  isCreator?: boolean;
  followedUser?: boolean;
}): {
  [option: string]: {
    label: string;
    icon: React.ComponentType;
  };
} => {
  const { delisted, isCreator } = props;

  const postCreatorOptions = delisted
    ? {}
    : {
        Edit: {
          label: "Edit",
          icon: PenToSquareRegularIcon,
        },
        Delete: {
          label: "Delete",
          icon: TrashCanRegularIcon,
        },
      };

  const postNotCreatorOptions = delisted
    ? {}
    : {
        Report: {
          label: "Report",
          icon: FlagRegularIcon,
        },
      };

  const postShareOptions = getPitchShareOptions();

  const postDefaultOptions = isCreator
    ? postCreatorOptions
    : postNotCreatorOptions;
  return {
    ...postShareOptions,
    ...postDefaultOptions,
  };
};

export default getPitchPostOptions;
