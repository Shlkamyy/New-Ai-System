# Android installation — ClinicFlow Railway staging (2026-10-21)
 
This adds the browser-installable **PWA shell** only. It is NOT an APK
download, not an offline dental database, and not production approval.

## Test on Android Chrome
1. Open the HTTPS Railway staging URL while online, then refresh once.
2. From Chrome's menu choose **Install app** or **Add to Home screen**.
3. Launch ClinicFlow from its home-screen icon. Log in with the normal
   staging account; existing permissions and Neon storage are unchanged.
4. Visit patients / appointments / finance (test-only records).
5. Disconnect from the internet. The app must NOT claim to show cached
   private patient/financial data or permit offline writes; reconnect.

## Data-safety and compatibility
- No service worker is registered. No application-owned offline caches
  persist patients, billing data, notes, or credentials.
- Railway serves authenticated API responses with no-store.
- App shell, manifest, and only two static local icons are allowlisted.
- Vercel also builds/serves precisely those static assets; default
  catch-all remains 404.
- HTTPS and install prompts depend on the browser and platform.
- Actual Android APK/Capacitor build and physical-device acceptance are
  separate release gates, not accomplished by this change.
