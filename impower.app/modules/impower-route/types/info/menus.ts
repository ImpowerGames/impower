export enum MenuType {
  Profile = "Profile",
  Connections = "Connections",
  Kudos = "Kudos",
  Account = "Account",
  Logout = "Logout",
}

export interface MenuInfo {
  type?: MenuType;
  label: string;
  link: string;
  icon?: React.ReactNode;
}
