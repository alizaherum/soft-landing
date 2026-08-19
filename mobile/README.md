# Soft Landing (mobile)

React Native app built with Expo, using Plaid's native Link SDK
(`react-native-plaid-link-sdk`) to connect a bank account and show a
Low/Tight/Comfortable status before revealing the actual balance.

It talks to the same backend as the web app (`../server.js`) — no separate
server needed.

## Why this needs a "development build," not Expo Go

Plaid Link ships native code, which Expo Go doesn't support. You need either:

- An **Expo development build** (recommended — built once via [EAS Build](https://docs.expo.dev/build/introduction/), then reused like a normal dev app), or
- A local native build via `npx expo run:ios` (needs a Mac + Xcode) or `npx expo run:android` (needs Android Studio)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to your computer's LAN IP (not `localhost` — your phone can't reach that), e.g. `http://192.168.1.42:3000`
3. Make sure the backend (`../server.js`) is running and reachable from your phone (same WiFi network)

## Plaid Dashboard setup (required before OAuth banks will work)

Native Link resolves the OAuth hand-off via your app's registered identifiers
instead of a redirect URL, so in the Plaid Dashboard under **Developers → API**:

- **Allowed Android package names**: add `com.softlanding.app` (or whatever you change `android.package` to in `app.json`)
- For iOS, register the bundle identifier `com.softlanding.app` (or your changed value) and an iOS redirect URI, wherever your Plaid Dashboard exposes iOS app configuration

## Building a development build with EAS (no Mac/Android Studio required)

```
npm install -g eas-cli
eas login
eas build:configure
eas build --profile development --platform android
```

This builds an installable `.apk`/`.aab` in Expo's cloud and gives you a
download link/QR code. Once installed on your phone, run:

```
npx expo start --dev-client
```

and open the app — it'll connect to your local Metro bundler over the same
WiFi network as your backend.

## Publishing to app stores

That's a separate, later step requiring your own Apple Developer ($99/year)
and Google Play Developer ($25 one-time) accounts, plus `eas submit`. Not
needed just to test the app on your own phone via a development build.
