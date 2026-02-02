#!/bin/bash

# Setup script for Android Capacitor project
# Run this after `npx cap add android`

set -e

ANDROID_DIR="android"
RES_DIR="$ANDROID_DIR/app/src/main/res"
XML_DIR="$RES_DIR/xml"

# Check if android directory exists
if [ ! -d "$ANDROID_DIR" ]; then
    echo "Error: Android directory not found. Run 'npx cap add android' first."
    exit 1
fi

echo "Setting up Android project..."

# Create xml directory if it doesn't exist
mkdir -p "$XML_DIR"

# Create network security config
cat > "$XML_DIR/network_security_config.xml" << 'EOF'
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
    </domain-config>
</network-security-config>
EOF

echo "Created network_security_config.xml"

# Update AndroidManifest.xml
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"

if [ -f "$MANIFEST" ]; then
    # Add network security config reference if not present
    if ! grep -q "networkSecurityConfig" "$MANIFEST"; then
        sed -i 's/<application/<application android:networkSecurityConfig="@xml\/network_security_config" android:usesCleartextTraffic="true"/' "$MANIFEST"
        echo "Updated AndroidManifest.xml with network security config"
    else
        echo "AndroidManifest.xml already has network config"
    fi
fi

# Update styles.xml for splash screen background
STYLES="$RES_DIR/values/styles.xml"
if [ -f "$STYLES" ]; then
    # Update splash background color
    sed -i 's/#FFFFFF/#0d1117/g' "$STYLES"
    echo "Updated splash screen background color"
fi

echo ""
echo "Android setup complete!"
echo ""
echo "Next steps:"
echo "1. npm run build:cap     # Build web assets"
echo "2. npx cap sync android  # Sync to Android"
echo "3. npx cap open android  # Open in Android Studio"
echo ""
