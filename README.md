# Loopstar

A one-tap arcade game for phones. Your comet circles a planet; tap to let go and sling into the
next planet's ring. Miss and you burn out. Built as a plain HTML5 canvas game (no engine, no
dependencies) and wrapped for Android with Capacitor.

![Feature graphic](store/feature-graphic-1024x500.png)

## How it plays

- **Tap** to release the comet. It flies straight for about 1.3 seconds before it burns out.
- Enter any planet's dashed ring to be caught. Each new planet scores a point.
- Release before one full lap for a **swift streak**: every 3 in a row raises the multiplier, up to x5.
- **Walls bounce.** Landing a bounce shot scores a bonus. Skipping a planet scores for each one skipped.
- A **red tide** rises from below, so you cannot wait forever.
- Later zones add drifting planets, mines and smaller, faster rings.
- Collect **stardust** to unlock comets or to continue a run once. Missions and a daily reward give more.

## Project layout

| Path | What it is |
| --- | --- |
| `www/` | The whole game: `index.html`, `style.css`, `game.js`, icons, font, PWA manifest and service worker |
| `android/` | Capacitor Android project (package `com.kajmaster.loopstar`, portrait, full screen) |
| `store/` | Play Store material: 512 px icon, feature graphic, 1080x1920 screenshots, listing text, privacy policy |
| `tools/` | Local server, automated playtest, asset generator, single-file bundler |
| `.github/workflows/android.yml` | Builds a debug APK and an unsigned release bundle on every push |

## Run it locally

```bash
node tools/serve.js        # then open http://localhost:8080 (use your browser's phone view)
```

Space or a click also launches the comet on desktop.

## Test

```bash
npm test                   # needs Playwright with Chromium
```

A bot plays six runs at accelerated speed. The test fails on any script error, or if the bot cannot get
past 60 planets in at least four runs, which would mean level generation produced an unfair layout.

## Build for Android

Requires Node 22+, JDK 21 and the Android SDK (Android Studio installs it).

```bash
npm ci
npm run android:debug      # android/app/build/outputs/apk/debug/app-debug.apk
npm run android:bundle     # android/app/build/outputs/bundle/release/app-release.aab (unsigned)
```

No Android Studio? Every push runs the **Android build** workflow; download the APK from the run's
artifacts on GitHub and install it on a phone.

## Publish to Google Play

1. Create a Play Console developer account (one-time fee, identity verification).
2. Decide the final package name **before the first upload**; it can never change afterwards. It is set in
   `capacitor.config.json` and `android/app/build.gradle` (plus the Java package folder).
3. Create an upload keystore and sign the release bundle. The simplest route is Android Studio:
   *Build > Generate Signed App Bundle*. Keep the keystore and its passwords safe and out of git.
4. Create the app in Play Console and upload the `.aab`. Use the text in `store/listing.md` and the
   graphics in `store/`.
5. Host `store/privacy-policy.md` at a public URL, add your contact email to it, and link it in the listing.
6. Fill in the content rating questionnaire and the data safety form (the game collects no data).
7. New personal developer accounts must run a closed test (currently 12 testers for 14 days) before
   Google allows a production release.
8. For each update, raise `versionCode` and `versionName` in `android/app/build.gradle`.

## Changing things

- Balance lives at the top of `www/game.js` (`FLY_SPEED`, `BURN_TIME`, `REVIVE_COST`) and in `genPlanet()`.
- Comets are the `SKINS` table, missions the `MISSIONS` table.
- After changing art in `tools/make-assets.js`, run `NODE_PATH=$(npm root -g) npm run assets`.
- The game has no ads or purchases. The "Continue" button spends stardust; it is the natural place to
  offer a rewarded ad later.

## Credits

Display typeface: [Unbounded](https://fonts.google.com/specimen/Unbounded), SIL Open Font License 1.1.
