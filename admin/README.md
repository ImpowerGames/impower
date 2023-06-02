# Impower Admin

These are scripts that can be run to manage data across our various server environments.

## Getting Started

1. Open the admin folder: `cd admin`
2. Install dependencies: `npm install`
3. Install firebase tools globally: `npm install -g firebase-tools`
4. Login to firebase by running `firebase login:ci` and logging with your impower.games email.
5. Create files named `dev.credentials.json`, `test.credentials.json`, and `prod.credentials.json`
6. Login to our vercel project, and view the environment variables at: `https://vercel.com/impowergames/impower/settings/environment-variables`
7. Copy the "Development" environment's `FIREBASE_SERVICE_ACCOUNT_KEY` value into `dev.credentials.json`
8. Copy the "Preview (deploy/test)" environment's `FIREBASE_SERVICE_ACCOUNT_KEY` value into `test.credentials.json`
9. Copy the "Production" environment's `FIREBASE_SERVICE_ACCOUNT_KEY` value into `prod.credentials.json`
10. Create files named `dev.auth.json`, `test.auth.json`, and `prod.auth.json`
11. Open the firebase auth console for each environment: e.g. `https://console.firebase.google.com/u/1/project/impowergames-dev/authentication/users`
12. Open "Password Hash Parameters" from the ... options menu.
13. Copy the "Development" project's hash parameters into `dev.auth.json`
14. Copy the "Test" project's hash parameters into `test.auth.json`
15. Copy the "Production" project's hash parameters into `prod.auth.json`

---

### Example credentials.json

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "YourSuperSecretPrivateKeyId",
  "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_SUPER_SECRET_PRIVATE_KEY_GOES_HERE\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-l33t@your-project-id.iam.gserviceaccount.com",
  "client_id": "YourClientId",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x420/firebase-adminsdk-l33t%40your-project-id.iam.gserviceaccount.com"
}
```

### Example auth.json

```json
{
  "algorithm": "SCRYPT",
  "base64_signer_key": "YourSuperSecretSignerKeyGoesHere",
  "base64_salt_separator": "Aa==",
  "rounds": 5,
  "mem_cost": 10
}
```

---

## Remote Config Publishing

- To publish to dev environment: `npm run config-dev`
- To publish to test environment: `npm run config-test`
- To publish to prod environment: `npm run config-prod`

## Wiping or Migrating Backend Data

- To wipe data from test environment: `npm run wipe-test`
- To migrate data from prod to test environment: `npm run migrate-prod-to-test`

---

## Production Deployment Process

First migrate the current production data into the test environment so old data can be tested with the new backend:

1. Deploy the test frontend by merging the branch deploy/dev into deploy/test
2. Deploy the test backend by running `npm run deploy-test` in `server/functions`
3. Deploy the test remote config variables by running `npm run config-test` in `impower/admin`
4. Wipe data in the test endpoint by running `npm run wipe-test` in `impower/admin`
5. Migrate prod data to the test endpoint by running `npm run migrate-prod-to-test` in `impower/admin`
6. Upgrade test data to the latest structure by running `npm run restructure-test` in `impower/admin`

Test the test endpoint at https://test.impower.app, and once all bugs are fixed, deploy to prod:

1. Deploy the prod frontend by merging the branch deploy/test into deploy/prod
2. Deploy the prod backend by running `npm run deploy-prod` in `server/functions`
3. Deploy the prod remote config variables by running `npm run config-prod` in `impower/admin`
6. Upgrade prod data to the latest structure by running `npm run restructure-prod` in `impower/admin`