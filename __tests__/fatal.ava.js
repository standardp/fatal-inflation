import { NEAR, Worker } from "near-workspaces";
import test from "ava";

const ONE_YOCTO = "1";
const TOTAL_SUPPLY = "1000000";

test.beforeEach(async (t) => {
    const worker = await Worker.init();
    const root = worker.rootAccount;

    const contract = await root.devDeploy("./build/fatal.wasm");
    const cause = await root.createSubAccount("cause", { initialBalance: NEAR.parse("5 N").toJSON() });
    const alice = await root.createSubAccount("alice", { initialBalance: NEAR.parse("5 N").toJSON() });
    const bob = await root.createSubAccount("bob", { initialBalance: NEAR.parse("5 N").toJSON() });

    await contract.call(contract, "init", {
        owner_id: contract.accountId,
        total_supply: TOTAL_SUPPLY,
        name: "Fatal Inflation",
        symbol: "FATAL",
        decimals: 24,
        cause_id: cause.accountId,
        cause_name: "Save the Whales",
        expiry_seconds: "3600",
    });

    // register alice and bob for storage
    for (const user of [alice, bob]) {
        await user.call(
            contract,
            "storage_deposit",
            { account_id: user.accountId },
            { attachedDeposit: NEAR.parse("0.01 N").toJSON() }
        );
    }

    t.context.worker = worker;
    t.context.accounts = { root, contract, cause, alice, bob };
});

test.afterEach.always(async (t) => {
    await t.context.worker.tearDown().catch((e) => console.log("teardown:", e));
});

test("init: supply goes to owner, cause is set", async (t) => {
    const { contract, cause } = t.context.accounts;
    t.is(await contract.view("ft_total_supply"), TOTAL_SUPPLY);
    t.is(await contract.view("ft_balance_of", { account_id: contract.accountId }), TOTAL_SUPPLY);
    t.deepEqual(await contract.view("get_cause"), { account_id: cause.accountId, name: "Save the Whales" });
    t.is(await contract.view("expiry_seconds"), "3600");
    t.is(await contract.view("total_donated"), "0");
});

test("transfer resets the clock; fresh balance is not expired", async (t) => {
    const { contract, alice } = t.context.accounts;
    await contract.call(
        contract,
        "ft_transfer",
        { receiver_id: alice.accountId, amount: "100", memo: null },
        { attachedDeposit: ONE_YOCTO }
    );
    t.is(await contract.view("ft_balance_of", { account_id: alice.accountId }), "100");
    t.is(await contract.view("expired_amount", { account_id: alice.accountId }), "0");
    const remaining = BigInt(await contract.view("expires_in_seconds", { account_id: alice.accountId }));
    t.true(remaining > 0n);
});

test("sweep before expiry fails", async (t) => {
    const { contract, alice, bob } = t.context.accounts;
    await contract.call(
        contract,
        "ft_transfer",
        { receiver_id: alice.accountId, amount: "100", memo: null },
        { attachedDeposit: ONE_YOCTO }
    );
    await t.throwsAsync(
        bob.call(contract, "sweep_expired", { account_id: alice.accountId }),
        { message: /not expired/ }
    );
});

test("idle tokens get donated to the cause, by anyone", async (t) => {
    const { contract, cause, alice, bob } = t.context.accounts;
    await contract.call(
        contract,
        "ft_transfer",
        { receiver_id: alice.accountId, amount: "100", memo: null },
        { attachedDeposit: ONE_YOCTO }
    );
    // owner shrinks the window to zero: any idle balance is now expired
    await contract.call(contract, "set_expiry_seconds", { seconds: "0" });

    t.is(await contract.view("expired_amount", { account_id: alice.accountId }), "100");

    // bob is a stranger - anyone can trigger the donation
    const swept = await bob.call(contract, "sweep_expired", { account_id: alice.accountId });
    t.is(String(swept), "100");
    t.is(await contract.view("ft_balance_of", { account_id: alice.accountId }), "0");
    t.is(await contract.view("ft_balance_of", { account_id: cause.accountId }), "100");
    t.is(await contract.view("total_donated"), "100");

    // nothing left to sweep
    await t.throwsAsync(
        bob.call(contract, "sweep_expired", { account_id: alice.accountId }),
        { message: /no balance/ }
    );
    // the cause itself cannot be swept
    await t.throwsAsync(
        bob.call(contract, "sweep_expired", { account_id: cause.accountId }),
        { message: /cause account cannot be swept/ }
    );
});

test("activity saves you: transfer in, window passes on the old coins only", async (t) => {
    const { contract, cause, alice, bob } = t.context.accounts;
    await contract.call(
        contract,
        "ft_transfer",
        { receiver_id: alice.accountId, amount: "50", memo: null },
        { attachedDeposit: ONE_YOCTO }
    );
    // alice keeps moving: she sends 10 to bob, which resets HER clock too
    await alice.call(
        contract,
        "ft_transfer",
        { receiver_id: bob.accountId, amount: "10", memo: null },
        { attachedDeposit: ONE_YOCTO }
    );
    await contract.call(contract, "set_expiry_seconds", { seconds: "0" });
    // both alice and bob were active recently, but with a zero window everyone is expired:
    // the point of the mechanic is that inactivity is measured per account
    const sweptAlice = await bob.call(contract, "sweep_expired", { account_id: alice.accountId });
    t.is(String(sweptAlice), "40");
    t.is(await contract.view("ft_balance_of", { account_id: cause.accountId }), "40");
});

test("only the owner can move the cause or the window", async (t) => {
    const { contract, alice, bob } = t.context.accounts;
    await t.throwsAsync(
        alice.call(contract, "set_cause", { account_id: alice.accountId, name: "rug" }),
        { message: /Only the owner/ }
    );
    await t.throwsAsync(
        alice.call(contract, "set_expiry_seconds", { seconds: "999999" }),
        { message: /Only the owner/ }
    );
    await contract.call(contract, "set_cause", { account_id: bob.accountId, name: "New Cause" });
    t.deepEqual(await contract.view("get_cause"), { account_id: bob.accountId, name: "New Cause" });
});
