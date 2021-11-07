export enum MenuType {
  Connections = "Connections",
  Profile = "Profile",
  Account = "Account",
  Logout = "Logout",
}

export interface MenuInfo {
  type?: MenuType;
  label: string;
  link: string;
  icon?: React.ReactNode;
}
