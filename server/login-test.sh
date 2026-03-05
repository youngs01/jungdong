#!/bin/bash
# simple shell script to test login API
# usage: ./login-test.sh <api_url> <user_id> <password>
API_URL="${1:-http://localhost:3000}"
USER_ID="${2:-user001}"
PASSWORD="${3:-1234}"

echo "Logging in to $API_URL with user $USER_ID"

curl -s -X POST "$API_URL/api/login" \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\", \"password\": \"$PASSWORD\"}" \
    | jq .

