import React from "react";
import LinkRegularIcon from "../../../resources/icons/regular/link.svg";
import ShareRegularIcon from "../../../resources/icons/regular/share.svg";

const getPitchShareOptions = (): {
  [option: string]: {
    label: string;
    icon: React.ComponentType;
  };
} => {
  const postShareOptions = {
    ...(typeof navigator !== "undefined" && navigator.clipboard
      ? { Link: { label: "Copy Link", icon: LinkRegularIcon } }
      : {}),

    ...(typeof navigator !== "undefined" && navigator.share
      ? {
          Via: {
            label: "Share via...",
            icon: ShareRegularIcon,
          },
        }
      : {}),
  };

  return postShareOptions;
};

export default getPitchShareOptions;
