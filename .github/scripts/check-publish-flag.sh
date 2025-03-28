#!/bin/bash
set -e

BASE_BRANCH="master"

CURRENT_VERSION=$(node -p "require('./package.json').version")

# Checkout the base branch temporarily to compare version
git fetch origin $BASE_BRANCH --quiet
git checkout FETCH_HEAD -- package.json --quiet

PREVIOUS_VERSION=$(node -p "require('./package.json').version")

# Restore the working copy package.json
git checkout HEAD -- package.json --quiet

# Check if version has changed
if [ "$CURRENT_VERSION" != "$PREVIOUS_VERSION" ]; then
  echo "should_publish=true"
  echo "Version changed from $PREVIOUS_VERSION to $CURRENT_VERSION - will publish"
else
  echo "should_publish=false"
  echo "Version unchanged ($CURRENT_VERSION) - skipping publication"
fi
