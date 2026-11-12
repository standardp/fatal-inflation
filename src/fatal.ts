// FATAL INFLATION
// A token that donates itself to a cause if you don't spend it.
//
// Mechanic: every account has a `last activity` timestamp. Any token movement
// (send or receive) resets it. If an account holds tokens untouched for longer
// than `expiry_window`, ANYONE can call `sweep_expired` and the idle balance is
// transferred to the registered cause. No owner, no bot, no cron: the donation
// is a rule of the contract itself.
//
// Built on the official NEP-141 implementation from near-contract-standards.

import {
    StorageBalance,
    StorageBalanceBounds,
    StorageManagement,
    FungibleTokenCore,
    FungibleTokenResolver,
    FungibleToken,
    FungibleTokenMetadata,
} from "near-contract-standards/lib";

import {
    AccountId,
    Balance,
    PromiseOrValue,
    call,
    view,
    initialize,
    NearBindgen,
    IntoStorageKey,
    LookupMap,
    near,
    assert,
} from "near-sdk-js";

type Option<T> = T | null;

const NS_PER_SECOND: bigint = BigInt(1_000_000_000);

class FTPrefix implements IntoStorageKey {
    into_storage_key(): string {
        return "A";
    }
}

@NearBindgen({ requireInit: true })
export class FatalInflation implements FungibleTokenCore, StorageManagement, FungibleTokenResolver {
    token: FungibleToken;
    metadata: FungibleTokenMetadata;
    // ns timestamp of the last token movement touching each account
    lastActivity: LookupMap<bigint>;
    expiryWindowNs: bigint;
    causeId: AccountId;
    causeName: string;
    totalDonated: bigint;
    owner: AccountId;

    constructor() {
        this.token = new FungibleToken();
        this.metadata = new FungibleTokenMetadata("", "", "", "", null, null, 0);
        this.lastActivity = new LookupMap("b");
        this.expiryWindowNs = BigInt(0);
        this.causeId = "";
        this.causeName = "";
        this.totalDonated = BigInt(0);
        this.owner = "";
    }

    @initialize({})
    init({
        owner_id,
        total_supply,
        name,
        symbol,
        decimals,
        cause_id,
        cause_name,
        expiry_seconds,
    }: {
        owner_id: AccountId;
        total_supply: Balance;
        name: string;
        symbol: string;
        decimals: number;
        cause_id: AccountId;
        cause_name: string;
        expiry_seconds: string;
    }) {
        const metadata = new FungibleTokenMetadata("ft-1.0.0", name, symbol, null, null, null, decimals);
        metadata.assert_valid();
        this.token = new FungibleToken().init(new FTPrefix());
        this.lastActivity = new LookupMap("b");
        this.metadata = metadata;
        this.owner = owner_id;
        this.expiryWindowNs = BigInt(expiry_seconds) * NS_PER_SECOND;
        this.causeId = cause_id;
        this.causeName = cause_name;
        this.totalDonated = BigInt(0);
        this.token.internal_register_account(owner_id);
        this.token.internal_register_account(cause_id);
        this.token.internal_deposit(owner_id, BigInt(total_supply));
        this.touch(owner_id);
    }

    // --- the mechanic ---

    touch(account_id: AccountId) {
        this.lastActivity.set(account_id, near.blockTimestamp());
    }

    isExpired(account_id: AccountId): boolean {
        const last = this.lastActivity.get(account_id);
        if (last === null) return false;
        return near.blockTimestamp() - last > this.expiryWindowNs;
    }

    /**
     * Permissionless: anyone can call this. If `account_id` held tokens idle
     * for longer than the expiry window, the full balance moves to the cause.
     */
    @call({})
    sweep_expired({ account_id }: { account_id: AccountId }): Balance {
        assert(account_id !== this.causeId, "The cause account cannot be swept");
        const balance: bigint = this.token.accounts.get(account_id) ?? BigInt(0);
        assert(balance > BigInt(0), "Account has no balance to sweep");
        assert(this.isExpired(account_id), "Account is not expired yet");
        this.token.internal_transfer(account_id, this.causeId, balance, "fatal: expired, donated to cause");
        this.touch(account_id);
        this.touch(this.causeId);
        this.totalDonated = this.totalDonated + balance;
        near.log(JSON.stringify({
            standard: "fatal-inflation",
            version: "1.0.0",
            event: "donation",
            data: [{
                from: account_id,
                cause_id: this.causeId,
                cause_name: this.causeName,
                amount: balance.toString(),
                total_donated: this.totalDonated.toString(),
            }],
        }));
        return balance;
    }

    // --- owner controls ---

    @call({})
    set_cause({ account_id, name }: { account_id: AccountId; name: string }) {
        assert(near.predecessorAccountId() === this.owner, "Only the owner can set the cause");
        if (!this.token.accounts.containsKey(account_id)) {
            this.token.internal_register_account(account_id);
        }
        this.causeId = account_id;
        this.causeName = name;
    }

    @call({})
    set_expiry_seconds({ seconds }: { seconds: string }) {
        assert(near.predecessorAccountId() === this.owner, "Only the owner can set the expiry window");
        this.expiryWindowNs = BigInt(seconds) * NS_PER_SECOND;
    }

    // --- mechanic views ---

    @view({})
    get_cause(): { account_id: AccountId; name: string } {
        return { account_id: this.causeId, name: this.causeName };
    }

    @view({})
    total_donated(): Balance {
        return this.totalDonated;
    }

    @view({})
    expiry_seconds(): string {
        return (this.expiryWindowNs / NS_PER_SECOND).toString();
    }

    @view({})
    last_activity({ account_id }: { account_id: AccountId }): string {
        const last = this.lastActivity.get(account_id);
        return last === null ? "0" : last.toString();
    }

    /** Seconds left before this account's balance is donatable. "0" if expired or unknown. */
    @view({})
    expires_in_seconds({ account_id }: { account_id: AccountId }): string {
        const last = this.lastActivity.get(account_id);
        if (last === null) return "0";
        const deadline = last + this.expiryWindowNs;
        const now = near.blockTimestamp();
        if (now >= deadline) return "0";
        return ((deadline - now) / NS_PER_SECOND).toString();
    }

    /** Balance that would be donated if swept right now. */
    @view({})
    expired_amount({ account_id }: { account_id: AccountId }): string {
        if (account_id === this.causeId) return "0";
        if (!this.isExpired(account_id)) return "0";
        return this.token.accounts.get(account_id)?.toString() ?? "0";
    }

    // --- NEP-141 core (with activity tracking) ---

    @call({ payableFunction: true })
    ft_transfer({
        receiver_id,
        amount,
        memo,
    }: {
        receiver_id: AccountId;
        amount: Balance;
        memo?: string;
    }) {
        const result = this.token.ft_transfer({ receiver_id, amount, memo });
        this.touch(near.predecessorAccountId());
        this.touch(receiver_id);
        return result;
    }

    @call({ payableFunction: true })
    ft_transfer_call({
        receiver_id,
        amount,
        memo,
        msg,
    }: {
        receiver_id: AccountId;
        amount: Balance;
        memo: Option<string>;
        msg: string;
    }): PromiseOrValue<bigint> {
        const result = this.token.ft_transfer_call({ receiver_id, amount, memo, msg });
        this.touch(near.predecessorAccountId());
        this.touch(receiver_id);
        return result;
    }

    @view({})
    ft_total_supply(): Balance {
        return this.token.ft_total_supply();
    }

    @view({})
    ft_balance_of({ account_id }: { account_id: AccountId }): Balance {
        return this.token.ft_balance_of({ account_id });
    }

    // --- storage management (NEP-145) ---

    @call({ payableFunction: true })
    storage_deposit({
        account_id,
        registration_only,
    }: {
        account_id?: AccountId;
        registration_only?: boolean;
    }): StorageBalance {
        return this.token.storage_deposit({ account_id, registration_only });
    }

    @view({})
    storage_withdraw({ amount }: { amount?: bigint }): StorageBalance {
        return this.token.storage_withdraw({ amount });
    }

    @call({ payableFunction: true })
    storage_unregister({ force }: { force?: boolean }): boolean {
        return this.token.storage_unregister({ force });
    }

    @view({})
    storage_balance_bounds(): StorageBalanceBounds {
        return this.token.storage_balance_bounds();
    }

    @view({})
    storage_balance_of({ account_id }: { account_id: AccountId }): Option<StorageBalance> {
        return this.token.storage_balance_of({ account_id });
    }

    @call({})
    ft_resolve_transfer({
        sender_id,
        receiver_id,
        amount,
    }: {
        sender_id: AccountId;
        receiver_id: AccountId;
        amount: Balance;
    }): Balance {
        return this.token.ft_resolve_transfer({ sender_id, receiver_id, amount });
    }
}
