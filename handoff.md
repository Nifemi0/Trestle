# BOT Chain Bridge — Handoff

Updated: 2026-09-16 (4-chain UI shipped + renamed **Trestle**)

## Current milestone

**Four chains wired and proven end-to-end, and the front end now covers all of them:**

- BOT Chain testnet (968) ↔ Arbitrum Sepolia (421614) ↔ Base Sepolia (84532) ↔ **Arc Testnet (5042002)**
- Hyperlane Mailboxes live on all four; BOT + Arc core deployed by us, Arb/Base use canonical core
- BOT-side `HypERC20Collateral` locks BOT testnet USDT; Arb/Base/Arc legs are synthetic `botUSDT`
- Wiring is a **full mesh** — every ordered pair is enrolled both directions
- Automatic relayer runs 4 chains / 12 routes (restrict with `RELAYER_ROUTES="bot<>arc,..."`)
- `npm test` (`test/security_check.js`) = **PASS**. The collateral-invariant check was stale (it compared
  locked collateral against the Arbitrum leg alone, so it failed by construction once Arc held 5
  botUSDT); it now sums every synthetic leg, and prints
  `158.0 locked vs 158.0 minted (Arbitrum 153.0 + Base Sepolia 0.0 + Arc Testnet 5.0)`.
- Frontend is 4-chain: FROM/TO selectors over BOT/Arbitrum/Base/Arc, 12 routes, 24/24 headless checks

## Front end (branded **Trestle**)

Name: **Trestle** — a trestle is a bridge type; `trestle.io` was free when the rename was made.
Branding is front-end only: contracts, relayer and scripts are untouched, and the route logic in
`app.js` only had two hex colours and one alias line changed.

Design direction (from a supplied reference): **acid chartreuse on near-black**, one accent used
for keylines and outlines rather than fills, condensed grotesk headings, expanded outlined wordmark,
mono for every on-chain value. Page structure: hero (canvas point-lattice terrain) → bridge card +
facts rail → 01–04 settlement steps → twelve-route matrix → live feed → footer.

```bash
node frontend/logic_test.js                 # 24 checks, no browser needed -> ALL CHECKS PASSED
systemctl restart botchain-frontend         # port 8088
curl -s localhost:8088/api/status
```

## Live frontend

URL: http://104.252.77.136:8088

Frontend directory: `/root/botchain-bridge/frontend/`

- `index.html` — home/positioning page
- `bridge.html` — focused transfer app
- `status.html` — live operational dashboard backed by `/api/status`
- `routes.html` — twelve-route matrix and enrolled chains
- `proof.html` — verification and pressure-test evidence
- `security.html` — testnet trust model and mainnet-readiness path
- `docs.html` — developer quickstart and repo guide
- `config.js` — shared chain config used by every page
- `icons.js` — geometric stroked SVG icon set + per-chain marks; `data-icon`/`data-mark` hydrate automatically (no emoji, no text glyphs)
- `styles.css` — design tokens + the *instrument* geometry layer: registration brackets, dimension rules, section indices, hatch fills, spec tables, monitor board, mobile-first breakpoints
- `mesh.js` — hero point-lattice terrain canvas (capped lattice, ~20fps, pauses off-screen, reduced-motion safe)
- `landing.js` — route matrix, facts rail, relayer heartbeat, scroll reveals
- `status.js` — live status page polling/rendering
- `nav.js` — shared active navigation + mobile menu
- `app.js` — wallet connection, network switching, balances, forward/reverse transfers, status polling;
  publishes `window.__trestle` as the bridge app state and migrates old `relayline_*`
  browser storage to `trestle_*`
- `logic_test.js` — headless VM test of the routing logic (24 checks)
- `server.py` — static server plus `/api/status` and extensionless page routes

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
| `contracts/compile_warp.js` / `contracts/compile_ism.js` | compile Hyperlane warp + ISM contracts from vendored sources |
| `scripts/deploy_warp.js` | original 2-chain deploy (BOT collateral + Arb synthetic + ISM + enrollment) |
| `scripts/add_chain.js` | **add a chain**: `--preflight` (read-only readiness) / `--deploy`; `--target=base\|op\|amoy` |
| `scripts/resume_chain.js` | **idempotent re-wire**: sends only missing ISM/enrollment txs, with explicit gas limits |
| `scripts/transfer.js` | end-to-end transfer any pair: `node scripts/transfer.js --from=bot --to=base --amount=25` |
| `scripts/hl.sh` | Hyperlane CLI wrapper — from the repo root: `./scripts/hl.sh <args>` |
| `src/relayer.js` | 4-chain relayer (12 routes, full mesh) with a `[no-gas]` guard that pauses an unfunded destination |
| `src/health.js` | status/watchdog: heartbeat, stuck messages, alerts, gas floors, cursor lag, collateral invariant |
| `test/security_check.js` | `npm test` — read-only integrity/accounting checks for all wired chains |
| `state/` | last-transfer records asserted by the test and the demo scripts |
| `systemd/*.service` | unit files for the relayer + demo frontend (installed to `/etc/systemd/system/`) |

**Layout note (reorganised 2026-09-16):** the repo root used to hold 31 flat files. Code now lives in
`src/` (processes), `scripts/` (tooling, with one-off investigations under `scripts/diagnostics/`),
`contracts/` (compiler + build output) and `test/`. Because every script pins
`const ROOT = '/root/botchain-bridge'`, the files could move without changing what they resolve; the
systemd unit's `ExecStart` and `package.json` scripts were updated to the new paths.

## Operations & stability (since 2026-09-16)

Both processes are **systemd services**, enabled at boot with `Restart=always`:

```bash
systemctl status botchain-relayer botchain-frontend
systemctl restart botchain-relayer            # after editing src/relayer.js
journalctl -u botchain-relayer -n 50 --no-pager
node /root/botchain-bridge/src/health.js --verbose
```

Relayer hardening (details in the README table): per-chain confirmation depth (Base needs 6), RPC
failover lists, retry/backoff per call, a persisted **pending-message ledger** that alerts when a
dispatch stays undelivered > 20 min, one-shot no-gas alerts, and a `relayer_health.json` heartbeat.

A Hermes cron job (`botchain-bridge-health`, every 15 min) runs `health.js` and stays **silent
unless something is wrong**, so failures reach chat without anyone watching logs.

Verified 2026-09-16: live BOT→Base→BOT round trip delivered under systemd; `kill -9` on the relayer
auto-restarted in ~12s (`NRestarts=1`) with a fresh heartbeat; accounting exact (locked 158 == minted 158).

The repo is under **git and published**: https://github.com/Nifemi0/Trestle (public, branch `main`).
`deployer.key`, `deployer.json`, `relayer.env`, `relayer_state.json`, logs and `node_modules` are
gitignored, and `*.env` / `.env` now are too.

**Publish audit (2026-09-16, before the first push):** no private key or API token exists in the
tracked files or anywhere in history — `deployer.key` / `deployer.json` were never committed
(0 commits added them), and `make_deployer.js` only *generates* a random wallet, it does not embed
one. The pushed tree was re-checked through the GitHub API after the push: 54 files, zero
secret-like paths. Any future push should re-run that check (the pre-push gate aborts if an
`.env`/key file is staged).

**Authorship:** every commit is authored and committed by
`Nifemi0 <130924107+Nifemi0@users.noreply.github.com>`, so the history links to the GitHub account.
The first six commits originally carried a placeholder identity; the history was rewritten on
2026-09-16 with the **tree hash unchanged** (attribution-only rewrite — no file content differs),
then force-pushed. The repo-local `user.name` / `user.email` are set to that identity, so future
commits are attributed correctly without extra flags.

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
   core was deployed from the local registry (`./scripts/hl.sh core deploy --chain arctestnet -o configs/core-config-arctestnet.yaml -y`,
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

Post-inspection fixes applied 2026-09-16:

- `src/relayer.js` now scopes dispatches to **Trestle router → Trestle router** messages only:
   message `origin`, `destination`, `sender` and `recipient` must all match the selected route. This
   closes the non-router Hyperlane-message gas-griefing bug found in the post-reorg inspection, and
   `test/relayer_scope_test.js` keeps it fixed.
- The repo now uses local package dependencies (`require('ethers')`) instead of importing ethers from
  `/root/copyentries`, so a clean clone can run after `npm install`.
- `add_chain.js` and `resume_chain.js` include every already-deployed peer (BOT, Arb, Base, Arc) when
  adding another chain, so future chains do not silently break the full-mesh promise.
- `configs/warp-route-usdt.yaml` includes `arctestnet`, matching the deployed state.
- Frontend transfers re-check/switch the source wallet chain and refresh signer/account immediately
  before sending, preventing stale-signer or wrong-network failures after manual wallet network changes.
- `src/health.js` treats old `alerts.log` entries as verbose history only; resolved transient alerts no
  longer keep the watchdog noisy for 24h.

## Next build step

1. Keep the public repo current (`https://github.com/Nifemi0/Trestle`) and adapt the positioning to the next BOT Chain hackathon theme.
2. Add chains 5 and 6 with `add_chain.js --target=op` / `--target=amoy` once their gas is funded —
   the UI route matrix picks them up automatically from `CONFIG`, no markup change needed.
3. Frontend is now fully on Trestle naming (`window.__trestle`, `trestle_*` storage); the old
   `relayline_*` storage keys are migrated/removed automatically for existing browser sessions.
4. Decide the grant/positioning story: BOT Chain's official bridge covers only BOT/BNB/TRON/ETH, and
   no mainstream interop (LayerZero/Wormhole/Axelar/CCTP/CCIP/deBridge/LI.FI) supports BOT Chain — the
   mesh-coverage angle is the differentiator, and the UI now shows it as twelve live routes.

## Important operating note

Do not expose or reuse the testnet deployer key for production. The key material remains in the local
protected file `deployer.json`; this handoff intentionally does not copy it. Also note `deployer.json`
and `deployer.key` currently sit in this directory — **exclude them before publishing this repo**.
