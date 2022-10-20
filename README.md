# Impower App

This is a React [Next.js](https://nextjs.org/) app.

It has been configured with:

- [Typescript](https://www.typescriptlang.org)
- Linting with [ESLint](https://eslint.org)
- Formatting with [Prettier](https://prettier.io)
- Optimized with [Preact-Compat](https://github.com/preactjs/preact-compat)
- UI built with [Material UI](https://mui.com)
- Styling with [Emotion](https://emotion.sh)
- "Progressive Web App (PWA)" functionality using [next-pwa](https://github.com/shadowwalker/next-pwa) and [Google Workbox](https://developers.google.com/web/tools/workbox)
- Backend API is managed with [Firebase](https://firebase.google.com)
- Deployment with [Vercel](https://vercel.com)

## Application Architecture

Frontend:

- Preact + NextJS

Backend:

- User Authentication: [Firebase Authentication](https://firebase.google.com/products/auth)
- DataStore (Firestore) Database: [Firebase Firestore](https://firebase.google.com/products/firestore)
- DataState (Realtime) Database: [Firebase Realtime Database](https://firebase.google.com/products/database)
- User File Storage: [Firebase Storage](https://firebase.google.com/products/storage)
- Remote Config: [Firebase Remote Config](https://firebase.google.com/products/remote-config)

The frontend and backend communicate through api calls provided by [Firebase](https://firebase.google.com)

## Game Architecture

Impower games are built on top of [Pixi.js](https://github.com/pixijs/pixijs).

The user can build their game using Impower Engine's visual drag-and-drop interface, or script it using Spark (aka "Sparkdown"), a simple markup syntax for writing, editing, and sharing games in plain, human-readable text.

Spark is inspired by [Markdown](https://www.markdownguide.org), [Fountain](https://fountain.io), and [Ink](https://www.inklestudios.com/ink)

The Impower Engine can export:

- Games as PWAs that the user can list on the website's "Play" page or host on their own website.
- Games as APK packages that the user can upload to the [Google Play Store](https://play.google.com/store).
- Screenplay PDFs in industry-standard screenplay format.

## Getting Started

1. Install Package Manager: [NodeJS](https://nodejs.org)
2. Install IDE: [VSCode](https://code.visualstudio.com)
3. Install Source Control GUI: [GitHub Desktop](https://desktop.github.com)

## The Client:

### First-Time Setup (impower/client):

1. Open the client folder: `cd client`
2. Install dependencies: `npm install`
3. Located within the `client` folder, create a copy of the `.env.local.example` file and name it `.env.development.local`
4. Using the google account that was added to our impowergames-dev project, follow the link to the [impowergames-dev firebase console](https://console.firebase.google.com/u/1/project/impowergames-dev) (make sure you are logged into your @impower.games google account!).
5. In the sidebar, click the `Gear icon` > `Project Settings`.
6. Click `Service accounts`.
7. Click `Generate new private key`.
8. Open the generated file and copy the entire json object.
9. Paste the entire json object into your `.env.development.local` file after `FIREBASE_SERVICE_ACCOUNT_KEY=`. (Format the json object so that it is all on a single line.)

### How To Run (impower/client):

1. Run the client: `npm run dev`
2. Open [http://localhost:3000](http://localhost:3000) with your browser to view the client app.

### Making Changes (impower/client):

1. You can start editing the app by modifying the files in `pages`. The app auto-updates as you edit the files.
2. Before pushing up your code, do `npm run check` to lint and type-check your files.

## The Server:

### First-Time Setup (server/functions):

1. Make sure you have been added as a developer on our private server repo. Then clone the server repo.
2. Follow the steps in the server's README Getting Started section to setup and run the local emulator.

### Making Changes (server/functions):

1. To edit Firestore Security Rules, edit: `firestore.rules`
2. To edit Firestore Indexes, edit: `firestore.indexes.json`
3. To edit Realtime Database Security Rules, edit: `database.rules.json`
4. To edit Storage Security Rules, edit: `storage.rules`
5. To edit Firebase Cloud Functions, edit: `src/index.ts`

## Reccomended IDE & Extensions

IDE: [Visual Studio Code](https://code.visualstudio.com/)

Extensions:

1. [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
   - Change "eslint.workingDirectories" to [ "./client", "./functions" ] in File > Preferences > Settings > Eslint: Working Directories
2. [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
   - Turn on File > Preferences > Settings > Format On Save
   - Open any .ts or .tsx file and run the vscode format shortcut. Then make sure to select Prettier as your default formatter
     - On Windows: Shift + Alt + F
     - On Mac: Shift + Option + F
     - On Linux: Ctrl + Shift + I

## API Usage

All api calls can be accessed through facade classes in the following folders:

- User Authentication: `Auth` from `modules/impower-auth`
- DataStore (Firestore) Database: `DataStore` from `modules/impower-data-store`
- DataState (Realtime) Database: `DataState` from `modules/impower-data-state`
- User File Storage: `Storage` from `modules/impower-storage`
- Remote Config: `Config` from `modules/impower-config`

To make an api call, simply use the properties and methods of the appropriate facade class.

Below is an example of calling the api:

```tsx
import React, { useCallback } from "react";
import { DataDocumentType } from "../../../impower-core";

export const LogoutButton = React.memo(() => {
  const handleSubmit = useCallback(async () => {
    const DataStateWrite = (
      await import("../../impower-data-state/classes/dataStateWrite")
    ).default;
    await new DataStateWrite("messages", "my_message_abc").create({
      _documentType: "MessageDocument",
      fullName: "My Name",
      email: "abc@gmail.com",
      message: "This is my message",
    });
  }, []);

  return <button onClick={handleSubmit}>Create</button>;
});
```

## API Changes

You can make changes to the backend database structure by editing the document files in `modules/impower-data-store`

1. To make a new document type, create a new file in `modules/impower-data-store/types/documents` and declare an interface that extends the interface `DataDocument` from `modules/impower-core`
2. To include your document in a collection, add it to `modules/impower-api/types/collectionDataPath.ts`
