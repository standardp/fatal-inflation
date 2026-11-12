#!/usr/bin/env bash
# FATAL INFLATION - end-to-end demo on NEAR testnet.
# Creates fresh accounts, deploys the contract, then shows:
# transfer -> countdown -> expiry -> permissionless donation to the cause.
#
# Usage: ./scripts/demo.sh
# Requires: near-cli-rs (`npm i -g near-cli-rs@latest`), build/fatal.wasm (run `npm run build` first).
set -euo pipefail
cd "$(dirname "$0")/.."

SUFFIX=${SUFFIX:-$RANDOM$RANDOM}
CONTRACT="fatal-$SUFFIX.testnet"
USER_ACC="fatal-user-$SUFFIX.testnet"
CAUSE="fatal-cause-$SUFFIX.testnet"
WINDOW_SECONDS=${WINDOW_SECONDS:-600}   # 10 minutes: watch it expire live

echo "== Creating testnet accounts (faucet-sponsored, free) =="
for acc in "$CONTRACT" "$USER_ACC" "$CAUSE"; do
  near account create-account sponsor-by-faucet-service "$acc" \
    autogenerate-new-keypair save-to-keychain network-config testnet create
done

echo "== Deploying contract to $CONTRACT =="
near contract deploy "$CONTRACT" use-file ./build/fatal.wasm \
  without-init-call network-config testnet sign-with-keychain send

echo "== Initializing: cause=$CAUSE window=${WINDOW_SECONDS}s =="
near contract call-function as-transaction "$CONTRACT" init \
  json-args "{\"owner_id\":\"$CONTRACT\",\"total_supply\":\"1000000000\",\"name\":\"Fatal Inflation\",\"symbol\":\"FATAL\",\"decimals\":24,\"cause_id\":\"$CAUSE\",\"cause_name\":\"Demo Cause\",\"expiry_seconds\":\"$WINDOW_SECONDS\"}" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as "$CONTRACT" network-config testnet sign-with-keychain send

echo "== Registering $USER_ACC for storage =="
near contract call-function as-transaction "$CONTRACT" storage_deposit \
  json-args "{\"account_id\":\"$USER_ACC\"}" \
  prepaid-gas '30 Tgas' attached-deposit '0.01 NEAR' \
  sign-as "$USER_ACC" network-config testnet sign-with-keychain send

echo "== Sending 1000 FATAL to $USER_ACC =="
near contract call-function as-transaction "$CONTRACT" ft_transfer \
  json-args "{\"receiver_id\":\"$USER_ACC\",\"amount\":\"1000\",\"memo\":\"spend me or lose me\"}" \
  prepaid-gas '30 Tgas' attached-deposit '0.000000000000000000000001 NEAR' \
  sign-as "$CONTRACT" network-config testnet sign-with-keychain send

echo "== Countdown for $USER_ACC =="
near contract call-function as-read-only "$CONTRACT" expires_in_seconds \
  json-args "{\"account_id\":\"$USER_ACC\"}" network-config testnet now

echo
echo "The clock is running. In $WINDOW_SECONDS seconds with no activity, run:"
echo
echo "  near contract call-function as-read-only $CONTRACT expired_amount json-args '{\"account_id\":\"$USER_ACC\"}' network-config testnet now"
echo "  near contract call-function as-transaction $CONTRACT sweep_expired json-args '{\"account_id\":\"$USER_ACC\"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $CAUSE network-config testnet sign-with-keychain send"
echo "  near contract call-function as-read-only $CONTRACT total_donated json-args '{}' network-config testnet now"
echo
echo "Contract: $CONTRACT | User: $USER_ACC | Cause: $CAUSE"
