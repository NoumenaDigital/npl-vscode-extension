#!/bin/bash
set -e

# Get PR body from GitHub event file
PR_BODY=$(jq -r '.pull_request.body' "$GITHUB_EVENT_PATH")

# Check for placeholder comment
if [[ "$PR_BODY" == *"<!-- Description of the PR changes -->"* ]]; then
  echo "Error: PR description still contains placeholder comment. Please replace it with actual description."
  exit 1
fi

# Check Ticket format if present
if echo "$PR_BODY" | grep -q "Ticket:"; then
  # Remove carriage returns before checking
  if ! echo "$PR_BODY" | tr -d '\r' | grep -q "^Ticket: ST-[0-9]*$"; then
    echo "Error: Ticket format is invalid. Should be 'Ticket: ST-XXXX' on its own line where XXXX are numbers."
    exit 1
  fi
fi

# Check Publish value
# Remove carriage returns before checking
PR_BODY_UNIX=$(echo "$PR_BODY" | tr -d '\r')
if echo "$PR_BODY_UNIX" | grep -q "^Publish: true$" || echo "$PR_BODY_UNIX" | grep -q "^Publish: false$"; then
  # Valid format found
  :
else
  echo "Error: PR description must include a line with exactly 'Publish: true' or 'Publish: false'."
  echo "Note: Make sure there are no trailing whitespace characters after 'true' or 'false'."
  exit 1
fi

echo "PR validation passed!"
exit 0
