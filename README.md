# FATAL INFLATION 💀

**The memecoin that dies if you don't spend it.**

HODLing is dead. Literally. FATAL is a token on NEAR with one rule baked into
the contract: if your balance sits untouched past the expiry window, **anyone**
can sweep it - and it doesn't burn, it gets **donated to a cause**. No owner
intervention, no off-chain bot, no cron. The meme is enforced by the contract
itself, permanently and permissionlessly.

Built at **NEAR HACKATHON 2026**.

## The meme

Every memecoin begs you to hold. FATAL punishes it. Inflation so fatal the
coin dies in your wallet if you let it sit. Use it or lose it - and "lose it"
means a whale charity gets your bag, triggered by a random stranger who
checked your countdown and pressed the button.

The mechanic *is* the meme:

- Every account has a `last activity` timestamp. Any movement (send or
  receive) resets your clock.
- `sweep_expired(account)` is a **permissionless public method**. Idle past
  the window? Your full balance moves to the registered cause. The caller
  needs no relationship to you - sweeping your neighbor's dead coins to
  charity is the community ritual.
- The cause's own bag can never be swept. Charities are allowed to HODL.
- Every donation emits a `fatal-inflation` event with the amount and running
  total, so a leaderboard of the fallen is trivial to build.
- Everything else is standard **NEP-141** + **NEP-145** storage, built on the
  official `near-contract-standards` implementation.

Supply that reacts to holders? Check. On-chain ritual? The sweep. Treasury
with rules? The cause registry. Judged on the mechanic, not the chart - good,
because the chart of a coin that deletes itself is conceptual art.

## Why this only works on NEAR

- **Cheap per-account storage**: a timestamp per holder costs fractions of a
  cent. Per-account activity tracking is the whole mechanic.
- **Named accounts**: the cause is a readable `something.near`, not a hex
  string. Donations you can read.
- **~1-2s finality**: the demo shows a balance expiring and getting swept to
  charity live, in one sitting.
- One contract on NEAR's native WASM runtime. No bridges, no oracles, no
  keepers.

## Try it yourself

Live on NEAR **testnet**. Contract: `fatal-inflation.testnet`
(expiry window: 10 minutes, so you can watch a balance die in real time).

With [near-cli-rs](https://docs.near.org/tools/cli):

```sh
# 1. See the cause that collects the dead coins
near contract call-function as-read-only fatal-inflation.testnet get_cause \
    json-args '{}' network-config testnet now

# 2. Check any holder's death countdown - do X, see Y:
near contract call-function as-read-only fatal-inflation.testnet expires_in_seconds \
    json-args '{"account_id":"SOMEONE.testnet"}' network-config testnet now

# 3. Once the countdown hits zero, their balance is up for grabs:
near contract call-function as-read-only fatal-inflation.testnet expired_amount \
    json-args '{"account_id":"SOMEONE.testnet"}' network-config testnet now

# 4. Send it to charity yourself (anyone can sign this):
near contract call-function as-transaction fatal-inflation.testnet sweep_expired \
    json-args '{"account_id":"SOMEONE.testnet"}' prepaid-gas '30 Tgas' \
    attached-deposit '0 NEAR' sign-as YOU.testnet network-config testnet \
    sign-with-keychain send

# 5. The running body count:
near contract call-function as-read-only fatal-inflation.testnet total_donated \
    json-args '{}' network-config testnet now
```

Or spin up your own fresh instance end-to-end (accounts, deploy, demo flow):

```sh
./scripts/demo.sh
```

## Run the tests

Local sandbox (no network, no faucet), full lifecycle: mint, transfer,
expire, sweep, donate - plus the owner-only guards:

```sh
npm install
npm run build
npm test
```

## Repo layout

```
src/fatal.ts            the contract (TypeScript, near-sdk-js)
__tests__/fatal.ava.js  full lifecycle tests on a local sandbox (near-workspaces)
scripts/demo.sh         spins up a fresh end-to-end demo on testnet
```

## Scope and honesty

- FATAL is a mechanic, not collateral: this is a demo token, not a backed
  stablecoin or an investment. The product is the rule - idle money moves to
  a cause - and the contract is the whole thing.
- `expiry_seconds` is owner-configurable so the same contract runs a 30-day
  campaign or a 10-minute demo.
- A refunded `ft_transfer_call` still counts as activity for both parties.
  Documented, deliberate, conservative.
- Built with AI pair-programming assistance (allowed and disclosed per
  hackathon rule Q-005). Every line reviewed and tested by the human.

## License

MIT - see [LICENSE](LICENSE).
