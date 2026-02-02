# Android Setup Instructions

After running `npx cap add android`, apply these configurations:

## 1. Network Security Config

Create `android/app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">192.168.0.0/16</domain>
    </domain-config>
</network-security-config>
```

## 2. AndroidManifest.xml Updates

Add to `android/app/src/main/AndroidManifest.xml`:

In `<manifest>` tag:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

In `<application>` tag, add:
```xml
android:networkSecurityConfig="@xml/network_security_config"
android:usesCleartextTraffic="true"
```

## 3. App Icons

Replace the launcher icons in:
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` (48x48)
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` (72x72)
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` (96x96)
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` (144x144)
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` (192x192)

## 4. Splash Screen

Replace `android/app/src/main/res/drawable/splash.png` with your splash image.

Update colors in `android/app/src/main/res/values/styles.xml`:
```xml
<style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
    <item name="android:background">#0d1117</item>
</style>
```

## 5. Build & Run

```bash
# Build web assets
npm run build:cap

# Sync to Android
npx cap sync android

# Open in Android Studio
npx cap open android

# Or run directly (requires connected device/emulator)
npx cap run android
```

## Troubleshooting

### SSL/Network Issues
If you see network errors, ensure:
1. The backend server is running
2. The server IP is accessible from the device
3. Configure server URL in app settings after first launch

### Build Issues
```bash
# Clear and rebuild
cd android && ./gradlew clean
cd .. && npm run build:cap && npx cap sync android
```
