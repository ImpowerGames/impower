import React, { useContext } from "react";
import { ConfigContext } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import { PageDocument } from "../../../impower-data-store";
import { DynamicIcon } from "../../../impower-icon";
import Avatar from "./Avatar";

interface PageAvatarProps {
  doc: PageDocument;
  fontSize?: string;
  onClick?: () => void;
}

const PageAvatar = (props: PageAvatarProps): JSX.Element => {
  const { doc, fontSize, onClick } = props;

  const [configState] = useContext(ConfigContext);

  const imageSrc = doc?.icon?.fileUrl;

  const name = doc?.name;
  const mainTag = doc?.tags?.[0] || "";
  const tagIconNames =
    configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;
  const tagIconName = tagIconNames?.[mainTag] || "";

  const tagColor = tagIconName ? doc?.hex : "#052d57";

  return (
    <Avatar
      backgroundColor={tagColor}
      backgroundImageSrc={imageSrc}
      name={name}
      icon={
        mainTag ? <DynamicIcon icon={tagIconName || "hashtag"} /> : undefined
      }
      fontSize={fontSize}
      onClick={onClick}
      style={{
        borderRadius: "inherit",
        width: "100%",
        height: "100%",
      }}
    />
  );
};

export default PageAvatar;
