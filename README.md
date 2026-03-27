# FxDAO SDK JS

---

## Test `withdraw_collateral` from your vault

This repository includes a ready script at `src/scripts/test-withdraw.ts` that calls `updateVault` with `withdraw_collateral`.

### 1) Create your local env file

```bash
cp .env.example .env
```

Then edit `.env` and set:

- `RPC_URL`
- `NETWORK` (`PUBLIC` or `TESTNET`)
- `CONTRACT_ID`
- `SECRET` (the signer secret key for the vault owner)
- `SIMULATION_ACCOUNT` (any existing account in the selected network)
- `DENOMINATION` (`USD`, `EUR`, or `GBP`)
- `WITHDRAW_XLM` (defaults to `100` if not provided)

### 2) Run the withdraw test

```bash
npm run test-withdraw:env
```

The script prints vault collateral/debt before and after the transaction and confirms success when the transaction is finalized.
