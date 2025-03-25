#!/bin/bash
set -e

# Get the commit message
COMMIT_MSG=$(git log -1 --pretty=%B)

# Check for Publish trailer
if [[ "$COMMIT_MSG" == *"Publish: true"* ]]; then
  echo "should_publish=true"
  echo "Publish: true found in commit message"
elif [[ "$COMMIT_MSG" == *"Publish: false"* ]]; then
  echo "should_publish=false"
  echo "Publish: false found in commit message - skipping publication"
else
  echo "should_publish=false"
  echo "No Publish trailer found in commit message - skipping publication"
fi
