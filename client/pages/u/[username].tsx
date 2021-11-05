import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { GetStaticPaths, GetStaticProps } from "next";
import React, { useContext, useEffect } from "react";
import getLocalizationConfigParameters from "../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../lib/getTagConfigParameters";
import { initAdminApp } from "../../lib/initAdminApp";
import { ConfigParameters } from "../../modules/impower-config";
import {
  getSerializableDocument,
  UserDocument,
} from "../../modules/impower-data-store";
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
  id: string;
  doc: UserDocument;
}

const UserProfilePage = React.memo((props: UserProfilePageProps) => {
  const { config, id, doc } = props;
  const [userState] = useContext(UserContext);
  const { uid, userDoc } = userState;

  const isCurrentUser =
    uid === undefined || id === undefined ? undefined : id === uid;
  const latestDoc = isCurrentUser && userDoc ? userDoc : doc;

  const [, navigationDispatch] = useContext(NavigationContext);

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
        id={id}
        username={username}
        bio={bio}
        icon={icon}
        hex={hex}
        isCurrentUser={isCurrentUser}
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
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  let userId = null;
  let serializableData = null;
  try {
    const docUsername = Array.isArray(username) ? username[0] : username;
    const adminApp = await initAdminApp();
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
  } catch (e) {
    console.warn(e);
  }

  return {
    props: {
      config,
      id: userId || null,
      doc: serializableData || null,
    },
    // Regenerate the page:
    // - When a request comes in
    // - At most once every 60 seconds
    revalidate: 60,
  };
};

export default UserProfilePage;
