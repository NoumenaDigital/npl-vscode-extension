#!/bin/bash
set -e

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version from package.json: $CURRENT_VERSION"

# Get latest release tag (assuming tags are in the format v1.0.0)
LATEST_TAG=$(git describe --tags --match "v*" --abbrev=0 2>/dev/null || echo "v0.0.0")
echo "Latest release tag: $LATEST_TAG"

# Remove 'v' prefix for comparison
LATEST_VERSION=${LATEST_TAG#v}
echo "Latest version: $LATEST_VERSION"

# Check if version has changed
if [ "$CURRENT_VERSION" != "$LATEST_VERSION" ]; then
  echo "should_publish=true"
  echo "Version changed from $LATEST_VERSION to $CURRENT_VERSION - will publish"
else
  echo "should_publish=false"
  echo "Version unchanged ($CURRENT_VERSION) - skipping publication"
fi
