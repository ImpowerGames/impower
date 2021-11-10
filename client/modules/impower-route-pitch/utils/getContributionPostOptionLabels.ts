const getContributionPostOptionLabels = (props: {
  delisted?: boolean;
  isCreator?: boolean;
  followedUser?: boolean;
}): {
  [option: string]: string;
} => {
  const { delisted, isCreator } = props;

  const postCreatorOptions = delisted
    ? {}
    : {
        Edit: "Edit",
        Delete: "Delete",
      };

  const postDefaultOptions = delisted
    ? {}
    : {
        OpenPitch: "Open Pitch Page",
        Link: "Copy Contribution Link",
        Via: "Share via...",
      };

  const postNotCreatorOptions = {
    Report: "Report",
  };

  return isCreator
    ? { ...postCreatorOptions, ...postDefaultOptions }
    : { ...postDefaultOptions, ...postNotCreatorOptions };
};

export default getContributionPostOptionLabels;
