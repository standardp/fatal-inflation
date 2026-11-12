# FATAL INFLATION

**Money that donates itself if you don't spend it.**

FATAL is a token on NEAR with one rule baked into the contract: if your balance
sits untouched for longer than the expiry window, **anyone** can trigger its
donation to a registered cause. No owner intervention, no off-chain bot, no
cron job. The donation is enforced by the contract itself, permanently and
permissionlessly.

Built at **NEAR HACKATHON 2026** (Open Innovation track).

## The problem

Stablecoins were meant to move. Instead, most balances sit idle in wallets
doing nothing for anyone. The idea of "expiring money" is a century old
(Silvio Gesell's demurrage, 1916; the Chiemgauer local currency still stamps
paper bills that lose value each quarter), but it never had a neutral
enforcer: someone always had to *decide* to take your idle money, and that
someone could be lobbied, hacked, or shut down.

A smart contract doesn't have that problem. FATAL makes the rule credible
because nobody can switch it off - and makes it charitable: idle money
doesn't get burned or taxed, it gets **donated**.

## How it works

- Every account has a `last activity` timestamp. Any token movement (sending
  or receiving) resets it.
- `sweep_expired(account)` is a **permissionless public method**. If the
  account's balance has been idle past the expiry window, the full balance
  moves to the cause. The caller needs no relationship to the account -
  keeping the network clean is everyone's job, like a liquidator in DeFi.
- The cause is a registered NEAR account chosen by the deployer
  (`set_cause`, owner-only). The cause's own balance can never be swept.
- Every donation emits a `fatal-inflation` event log with the amount and the
  running total, so a dashboard can track donations in real time.
- Everything else is standard **NEP-141** (`ft_transfer`, `ft_transfer_call`,
  `ft_balance_of`, ...) and **NEP-145** storage management, built on the
  official `near-contract-standards` implementation.

Use it for stimulus programs that must circulate, local currencies,
"give it away or lose it" community funds, or marketing budgets that
self-donate when unspent.

## Why NEAR

- **Cheap, named accounts**: the cause is `something.near`, readable by a
  human, not a hex string.
- **Affordable per-account storage**: a timestamp per holder costs fractions
  of a cent, which makes per-account activity tracking practical.
- **Fast finality (~1-2s)**: the demo shows a balance expiring and getting
  donated live, in a single sitting.
- The whole mechanic is one contract on NEAR's native WASM runtime - no
  bridges, no oracles, no keepers.

## Try it yourself

Live on NEAR **testnet**. Contract: `CONTRACT_ID_HERE` (deployed 2026-11-12,
expiry window: 10 minutes so you can watch it happen).

With [near-cli-rs](https://docs.near.org/tools/cli) (`cargo install near-cli-rs`
or `npm i -g near-cli-rs@latest`):

```sh
# 1. Check the registered cause
near contract call-function as-read-only CONTRACT_ID_HERE get_cause \
    json-args '{}' network-config testnet now

# 2. Send yourself some FATAL (from any funded testnet account).
#    First register for storage, then ask the faucet account or a friend
#    to transfer you tokens.

# 3. Check your countdown - do X, see Y:
near contract call-function as-read-only CONTRACT_ID_HERE expires_in_seconds \
    json-args '{"account_id":"YOU.testnet"}' network-config testnet now

# 4. Wait 10 minutes without touching your tokens, then call:
near contract call-function as-read-only CONTRACT_ID_HERE expired_amount \
    json-args '{"account_id":"YOU.testnet"}' network-config testnet now
#    -> your full balance is now donatable

# 5. Donate it (anyone can - you, a friend, a stranger):
near contract call-function as-transaction CONTRACT_ID_HERE sweep_expired \
    json-args '{"account_id":"YOU.testnet"}' prepaid-gas '30 Tgas' \
    attached-deposit '0 NEAR' sign-as SOMEONE.testnet network-config testnet \
    sign-with-keychain send

# 6. See the running total donated to the cause:
near contract call-function as-read-only CONTRACT_ID_HERE total_donated \
    json-args '{}' network-config testnet now
```

Or run the scripted end-to-end demo against your own deployment:

```sh
./scripts/demo.sh
```

## Run the tests

Local sandbox (no network, no faucet), full lifecycle: mint, transfer,
expire, sweep, donate - plus owner-only guards:

```sh
npm install
npm run build
npm test
```

## Repo layout

```
src/fatal.ts          the contract (TypeScript, near-sdk-js)
__tests__/fatal.ava.js  full lifecycle tests on a local sandbox (near-workspaces)
scripts/demo.sh       end-to-end demo against a live testnet deployment
```

## Scope and honesty

- This is a **demo token representing a stablecoin**, not a collateralized
  stable. The mechanic (idle balance -> cause) is the product; collateral
  design is out of scope for a hackathon.
- `expiry_seconds` is owner-configurable so the same contract serves a
  30-day campaign and a 10-minute demo.
- A refunded `ft_transfer_call` still counts as activity for both parties.
  Documented, deliberate, conservative.
- Built with AI pair-programming assistance (allowed and disclosed per
  hackathon rule Q-005). Every line reviewed and tested by the human.

## License

MIT - see [LICENSE](LICENSE).
