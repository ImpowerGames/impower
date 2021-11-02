import React from "react";
import FlagRegularIcon from "../../../resources/icons/regular/flag.svg";
import LinkRegularIcon from "../../../resources/icons/regular/link.svg";
import PenToSquareRegularIcon from "../../../resources/icons/regular/pen-to-square.svg";
import ShareRegularIcon from "../../../resources/icons/regular/share.svg";
import TrashCanRegularIcon from "../../../resources/icons/regular/trash-can.svg";

const getContributionPostOptionIcons = (props: {
  delisted?: boolean;
  isCreator?: boolean;
  followedUser?: boolean;
}): {
  [option: string]: React.ComponentType;
} => {
  const { delisted, isCreator } = props;

  const postCreatorOptions = delisted
    ? {}
    : {
        Edit: PenToSquareRegularIcon,
        Delete: TrashCanRegularIcon,
      };

  const postDefaultOptions = delisted
    ? {}
    : {
        Link: LinkRegularIcon,
        Via: ShareRegularIcon,
      };

  const postNotCreatorOptions = {
    Report: FlagRegularIcon,
  };

  return isCreator
    ? { ...postCreatorOptions, ...postDefaultOptions }
    : { ...postDefaultOptions, ...postNotCreatorOptions };
};

export default getContributionPostOptionIcons;
