#!/bin/bash
# Build every platform and publish a GitHub release for the version in package.json.
# Usage: pnpm release            (notes from docs/release-notes/<version>.md, written in English)
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
NOTES="docs/release-notes/$VERSION.md"
[ -f "$NOTES" ] || { echo "Missing $NOTES (English release notes shown inside the app)"; exit 1; }
git diff --quiet || { echo "Commit your changes first"; exit 1; }

pnpm typecheck && pnpm test
rm -rf dist
pnpm dist:all

cd dist
FILES=(UniOS-$VERSION-arm64.dmg UniOS-$VERSION-x64.dmg UniOS-$VERSION-arm64-mac.zip UniOS-$VERSION-x64-mac.zip \
  UniOS-Setup-$VERSION-x64.exe UniOS-$VERSION-x86_64.AppImage UniOS-$VERSION-amd64.deb)
shasum -a 256 "${FILES[@]}" > SHA256SUMS.txt
cd ..
# Sign the checksums with the offline release key; the app refuses macOS updates without a valid signature.
KEY="${UNIOS_SIGNING_KEY:-$HOME/.config/unios-release/update-signing-key.pem}"
[ -f "$KEY" ] || { echo "Missing signing key $KEY"; exit 1; }
node scripts/sign-checksums.cjs "$KEY"

git tag -a "v$VERSION" -m "UniOS $VERSION"
git push origin main "v$VERSION"
gh release create "v$VERSION" --title "UniOS $VERSION" --notes-file "$NOTES" \
  $(printf 'dist/%s ' "${FILES[@]}") dist/SHA256SUMS.txt dist/SHA256SUMS.txt.sig \
  dist/latest.yml dist/latest-linux.yml dist/latest-mac.yml dist/*.blockmap
