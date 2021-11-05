import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { GetStaticPaths, GetStaticProps } from "next";
import React, { useContext, useEffect } from "react";
import getIconSvgData from "../../lib/getIconSvgData";
import getLocalizationConfigParameters from "../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../lib/getTagConfigParameters";
import { initAdminApp } from "../../lib/initAdminApp";
import { ConfigParameters } from "../../modules/impower-config";
import ConfigCache from "../../modules/impower-config/classes/configCache";
import {
  getSerializableDocument,
  ProjectDocument,
  UserDocument,
} from "../../modules/impower-data-store";
import {
  IconLibraryContext,
  iconLibraryRegister,
  SvgData,
} from "../../modules/impower-icon";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../../modules/impower-navigation";
import { BetaBanner } from "../../modules/impower-route";
import Profile from "../../modules/impower-route-account/Profile";
import useBodyBackgroundColor from "../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../modules/impower-route/hooks/useHTMLBackgroundColor";
import { UserContext } from "../../modules/impower-user";

const LOAD_INITIAL_LIMIT = 10;

const StyledProfilePage = styled.div`
  padding-top: ${(props): string => props.theme.minHeight.navigationBar};
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: ${(props): string => props.theme.colors.lightForeground};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    background-color: white;
  }
`;

interface UserProfilePageProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  id: string;
  doc: UserDocument;
  pitchDocs: { [id: string]: ProjectDocument };
}

const UserProfilePage = React.memo((props: UserProfilePageProps) => {
  const { config, icons, id, doc, pitchDocs } = props;
  const [userState] = useContext(UserContext);
  const { uid, userDoc } = userState;

  const isCurrentUser =
    uid === undefined || id === undefined ? undefined : id === uid;
  const latestDoc = isCurrentUser && userDoc ? userDoc : doc;

  const [, navigationDispatch] = useContext(NavigationContext);
  const [, iconLibraryDispatch] = useContext(IconLibraryContext);

  ConfigCache.instance.set(config);
  iconLibraryDispatch(iconLibraryRegister("solid", icons));

  const theme = useTheme();

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText());
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  const searchValue =
    typeof window !== "undefined"
      ? decodeURI(window.location.pathname.split("/").pop())
      : "";

  const username = latestDoc?.username || searchValue;
  const icon = latestDoc?.icon?.fileUrl;
  const hex = latestDoc?.hex;
  const bio = latestDoc?.bio;
  return (
    <StyledProfilePage>
      <BetaBanner />
      <Profile
        config={config}
        icons={icons}
        id={id}
        username={username}
        bio={bio}
        icon={icon}
        hex={hex}
        isCurrentUser={isCurrentUser}
        pitchDocs={pitchDocs}
      />
    </StyledProfilePage>
  );
});

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [],
    fallback: true,
  };
};

export const getStaticProps: GetStaticProps = async (context) => {
  const { username } = context.params;
  const docUsername = Array.isArray(username) ? username[0] : username;
  const adminApp = await initAdminApp();
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  const pitchDocs: { [id: string]: ProjectDocument } = {};
  const icons = {};
  let userId = null;
  let serializableData = null;
  try {
    const querySnapshot = await adminApp
      .firestore()
      .collection(`users`)
      .where("username", "==", docUsername)
      .limit(1)
      .get();
    const userSnap = querySnapshot.docs[0];
    userId = userSnap?.id;
    const userData = userSnap?.data();
    serializableData = getSerializableDocument<UserDocument>(userData);
    const iconNamesSet = new Set<string>();
    if (userId) {
      const pitchedCollection = "pitched_games";
      const pitchesSnapshot = await adminApp
        .firestore()
        .collection(`${pitchedCollection}`)
        .where("_createdBy", "==", userId)
        .where("nsfw", "==", false)
        .where("delisted", "==", false)
        .orderBy("_createdAt", "desc")
        .limit(LOAD_INITIAL_LIMIT)
        .get();
      pitchesSnapshot.docs.forEach((s) => {
        const serializableData = getSerializableDocument<ProjectDocument>(
          s.data()
        );
        pitchDocs[s.id] = serializableData;
        const mainTag = serializableData?.tags?.[0] || "";
        const tagIconName = config.tagIconNames[mainTag];
        if (tagIconName) {
          iconNamesSet.add(tagIconName);
        }
      });
    }
    const iconNames = Array.from(iconNamesSet);
    const iconData = await Promise.all(
      iconNames.map(async (name) => {
        if (name) {
          const component = (
            await import(`../../resources/icons/solid/${name}.svg`)
          ).default;
          return getIconSvgData(component);
        }
        return null;
      })
    );
    iconData.forEach((data, index) => {
      if (data) {
        icons[iconNames[index]] = data;
      }
    });
  } catch (e) {
    console.warn(e);
  }

  return {
    props: {
      config,
      icons,
      id: userId || null,
      doc: serializableData || null,
      pitchDocs,
    },
    // Regenerate the page:
    // - When a request comes in
    // - At most once every 60 seconds
    revalidate: 60,
  };
};

export default UserProfilePage;
