#!/usr/bin/env bash
# scripts/devin-poller.sh
# A local polling script for Devin Desktop to watch the GitHub queue.

echo "🥊 Devin Desktop Queue Poller Started"
echo "Listening for issues labeled 'agent:devin'..."

while true; do
  # Fetch unassigned, open issues for devin
  ISSUES=$(gh issue list --state open --label "agent:devin" --json number,title --jq '.[] | "#\(.number): \(.title)"')
  
  if [ -n "$ISSUES" ]; then
    echo "🚨 NEW WORK DETECTED 🚨"
    echo "$ISSUES"
    echo ""
    echo "Devin: Please run 'gh issue view <number>' on the oldest issue, execute the grilled spec, and when done, return to watching this loop."
    
    # We exit the poller so Devin can take over the terminal to do the work.
    # The human or Devin can restart the poller when the task is done.
    exit 0
  fi
  
  sleep 420 # 7 minutes
done
