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

  const mainColor = doc?.hex;

  const name = doc?.name;
  const mainTag = doc?.tags?.[0] || "";
  const tagIconNames =
    configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;
  const tagIconName = tagIconNames?.[mainTag] || "";

  return (
    <Avatar
      backgroundColor={mainColor}
      backgroundImageSrc={imageSrc}
      name={name}
      icon={mainTag ? <DynamicIcon icon={tagIconName} /> : undefined}
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
