# BOT Chain Bridge — Handoff

Updated: 2026-09-15 (Arc added)

## Current milestone

**Four chains wired and proven end-to-end:**

- BOT Chain testnet (968) ↔ Arbitrum Sepolia (421614) ↔ Base Sepolia (84532) ↔ **Arc Testnet (5042002)**
- Hyperlane Mailboxes live on all four; BOT + Arc core deployed by us, Arb/Base use canonical core
- BOT-side `HypERC20Collateral` locks BOT testnet USDT; Arb/Base/Arc legs are synthetic `botUSDT`
- Wiring is a **full mesh** — every ordered pair is enrolled both directions
- Automatic relayer runs 4 chains / 12 routes (restrict with `RELAYER_ROUTES="bot<>arc,..."`)
- `npm test` (`security_check.js`) = **PASS**, including the third-chain assertions
- Frontend still serves on port 8088 — **still 2-chain** (see Next build step)

## Live frontend

URL: http://104.252.77.136:8088

Frontend directory: `/root/botchain-bridge/frontend/`

- `index.html` — bridge UI
- `styles.css` — burgundy / charcoal responsive styling
- `app.js` — wallet connection, network switching, balances, forward/reverse transfers, status polling
- `server.py` — static server plus `/api/status`

Known gap: the UI is a **boolean flip between BOT and Arbitrum**; Base is wired on-chain but not
selectable in the UI yet. Base's canonical Mailbox also carries a required-hook config, so outbound
txs from Base should quote dispatch first — `transfer.js` already attempts `quoteDispatch` and falls
back to no value (which worked on Base Sepolia).

## Bridge contracts

| Contract | Chain | Address |
|---|---|---|
| Mailbox (ours) | BOT testnet (968) | `0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B` |
| Mailbox (canonical) | Arbitrum Sepolia (421614) | `0x598facE78a4302f11E3de0bee1894Da0b2Cb71F8` |
| Mailbox (canonical) | Base Sepolia (84532) | `0x6966b0E55883d49BFB24539356a2f8A673E02039` |
| `HypERC20Collateral` (locks USDT) | BOT testnet | `0xb2BFd514997773eBe9AF77E83e153e3A5405CEB6` |
| `HypERC20` synthetic `botUSDT` | Arbitrum Sepolia | `0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6` |
| `HypERC20` synthetic `botUSDT` | Base Sepolia | `0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6` |
| `TrustedRelayerIsm` | Arbitrum Sepolia | `0x045d2632c411a1394FeCb776A235431ecD0EB49D` |
| `TrustedRelayerIsm` | Base Sepolia | `0x045d2632c411a1394FeCb776A235431ecD0EB49D` |
| Mailbox (ours) | Arc Testnet | `0xC2E414899C49ff4C95c639aA6bca6B1f2799bF1B` |
| `HypERC20` synthetic `botUSDT` | Arc Testnet | `0x73E7fa23EE5743959A24143B6f51D2B5D9ffC784` |
| `TrustedRelayerIsm` | Arc Testnet | `0xb2BFd514997773eBe9AF77E83e153e3A5405CEB6` |
| BOT testnet USDT (canonical) | BOT testnet | `0x75edC9335175Fc0552D51D48439F229c10420fe3` |

> The Base and Arbitrum router/ISM addresses are **identical strings on different chains**. That is
> expected: CREATE address = f(sender, nonce), and the same deployer key ran the same nonce sequence
> on both chains. Same address, different chain — not a copy/paste error.

## Proof of transfer — all six directions

| Route | Amount | Source tx | Relay (`Mailbox.process`) |
|---|---|---|---|
| BOT → Arbitrum | 100 USDT | `0xd8130dd5e7c3…` (scan.bohr.life) | `0x80c25dffe561…` (arbiscan) |
| Arbitrum → BOT | 40 botUSDT | `0x56d2d227424b…` (arbiscan) | `0x69e400d5d66e…` (bohr) |
| **BOT → Base** | **25 USDT** | `0xc7b32493b76f95b34cd10e34353bcff130d5ee33a6729bb0de2c769d8c346fe3` | `0xeec9586b1f820e5a95…` (basescan) — 13s |
| **Base → BOT** | **25 botUSDT** | `0x3efe554332bd259c470387a8bce361a605303281ffc068ec563054d4d54a45c9` | delivered, `mailbox.delivered = true` |
| **Arbitrum → Base** | **10 botUSDT** | `0x2ccd3530749ef6a31780af8694a7bb9e484b7835efe5ff814f0fb7a8971e59bd` | delivered |
| **Base → Arbitrum** | **10 botUSDT** | `0xb853b5742eb676b94b284a7bd185e9d91a20ef70d230e0ec9a942b19c0cb5c50` | delivered |
| **BOT → Arc** | **15 USDT** | `0xcbb9f13a3866c6d08bdfd2f30877cd24d085203ce6789b54df45dcef8e662eba` | delivered, `mailbox.delivered = true` |
| **Arc → BOT** | **15 botUSDT** | `0x6640d51c6ed9daf2667db65c2bbec866a509636fdb7ef4246b47f2ca8532ba90` | delivered |
| **Base → Arc** | **5 botUSDT** | `0xd69c62651dc8db1d0e5afb82fefcc1bf7d70a5bd6fa1c0453429e71023071523` (messageId) | delivered |

Accounting after the round trips:

```
BOT locked collateral : 158.0 USDT
Arbitrum botUSDT      : 153.0   (supply)
Base botUSDT          :   0.0   (supply)
Arc botUSDT           :   5.0   (supply — left in place as proof the route is live)
invariant: locked == arb + base + arc supply  ->  true
```

Nothing was created or destroyed: base supply went 0 → 25 → 0 and arb 153 → 163 → 153 across the test.

## Scripts

| File | Purpose |
|---|---|
| `compile_warp.js` / `compile_ism.js` | compile Hyperlane warp + ISM contracts from vendored sources |
| `deploy_warp.js` | original 2-chain deploy (BOT collateral + Arb synthetic + ISM + enrollment) |
| `add_chain.js` | **add a chain**: `--preflight` (read-only readiness) / `--deploy`; `--target=base\|op\|amoy` |
| `resume_chain.js` | **idempotent re-wire**: sends only missing ISM/enrollment txs, with explicit gas limits |
| `transfer.js` | end-to-end transfer any pair: `node transfer.js --from=bot --to=base --amount=25` |
| `security_check.js` | `npm test` — read-only integrity/accounting checks for all wired chains |
| `relayer.js` | 4-chain relayer (12 routes, full mesh) with a `[no-gas]` guard that pauses an unfunded destination |

## Automatic relayer

Run:

```bash
npm run relayer
```

Safe scan:

```bash
npm run relayer:once -- --dry-run
```

`relayer.js` watches every configured Mailbox, waits for three confirmations, filters destination
domains, skips delivered messages, calls `Mailbox.process`, verifies delivery, and persists cursors in
`relayer_state.json`. Routes whose destination gas is empty are skipped with a single `[no-gas]`
warning instead of a failure storm.

## Pitfalls found while adding Base (read before adding the next chain)

1. **`setInterchainSecurityModule` reverted on Base with ethers' default gas estimate.** The identical
   call replayed successfully, and a fresh estimate (50,257) with a 1.5× gas limit settled fine.
   Always send wiring txs with an explicit gas limit (`resume_chain.js` does `estimate * 1.5`).
2. **CREATE-address collisions between chains are normal** with a reused deployer key — don't panic
   when Base and Arbitrum "share" an address.
3. **`DispatchId` log parsing by ABI fragment can fail** across core versions; decode the mailbox log
   directly (4 topics, `bytes` message in data, `messageId = keccak256(message)`).
4. **Every new chain needs its own gas.** A remote chain that is a synthetic leg needs gas only — no
   USDT faucet. Base Sepolia cost ~0.0001 ETH for deploy + all wiring.
5. **A testnet can be missing Hyperlane core entirely.** Arc testnet had none at any known address, so
   core was deployed from the local registry (`./hl.sh core deploy --chain arctestnet -o configs/core-config-arctestnet.yaml -y`,
   gas 0.5512121 USDC). Write `registry/chains/<name>/metadata.yaml` first — the CLI validates against
   its schema and needs `nativeToken` to be right (Arc's is **USDC, 18 decimals**, not ETH) and an
   `apiUrl`/`family` entry for the explorer.
6. **A non-ETH gas token is fine** for ethers, the relayer and the CLI, but every "balance" label in
   scripts/logs will say ETH — read it as the native token. Fund with that chain's faucet
   (Arc: faucet.circle.com → ARC; the drip is USDC, which is both gas and collateral).

## Security boundary

This is a testnet prototype, not a mainnet-ready bridge.

Current trust model:

- `TrustedRelayerIsm` accepts messages processed by the deployer relayer key
- The deployer key is a high-privilege testnet key
- Arb/Base assets are synthetic `botUSDT`, not canonical USDT on those chains
- No production liquidity vaults are deployed

Before real funds:

1. Replace the trusted relayer ISM with a validator/multisig ISM.
2. Use a separate isolated relayer key, not the deployer/owner key.
3. Move signing to a secure secret store or isolated signer.
4. Add rate limits, transfer caps, pause controls, monitoring, RPC failover, and reorg handling.
5. Add adversarial tests and obtain an audit.
6. Design and fund two-sided canonical-USDT liquidity only after the security work.

## Next build step

1. **Frontend: replace the BOT↔Arb flip with a 4-way route selector** (BOT / Arbitrum / Base / Arc) and
   handle outbound gas quotes on the non-BOT legs.
2. Add chains 5 and 6 with `add_chain.js --target=op` / `--target=amoy` once their gas is funded.
3. Keep AI/privacy positioning modular until BOT Chain announces the next hackathon theme.

## Important operating note

Do not expose or reuse the testnet deployer key for production. The key material remains in the local
protected file `deployer.json`; this handoff intentionally does not copy it. Also note `deployer.json`
and `deployer.key` currently sit in this directory — **exclude them before publishing this repo**.
