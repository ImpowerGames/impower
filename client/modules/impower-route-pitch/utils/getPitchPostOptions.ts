import BellRegularIcon from "../../../resources/icons/regular/bell.svg";
import FlagRegularIcon from "../../../resources/icons/regular/flag.svg";
import TrashCanRegularIcon from "../../../resources/icons/regular/trash-can.svg";
import BellSolidIcon from "../../../resources/icons/solid/bell.svg";
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
  const { delisted, isCreator, followedUser } = props;

  const postCreatorOptions = delisted
    ? {}
    : {
        Delete: {
          label: "Delete",
          icon: TrashCanRegularIcon,
        },
      };

  const postNotCreatorOptions = delisted
    ? {}
    : {
        FollowUser: {
          label: followedUser ? "Following User" : "Follow User",
          icon: followedUser ? BellSolidIcon : BellRegularIcon,
        },
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
