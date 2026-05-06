# MCPP

**Multi‑Council Paper Portfolio** — *the revenge of the nerd edition.*

We didn’t come here to lose pocket protectors. We came here to pipe live quotes through a signal stack, let a rotating council of models argue about **two names at a time** (equities **AAPL/TSLA** or spot **BTC/ETH** when stocks are closed), and watch fake money move like it’s rush week for robots.

> “Nice portfolio… shame if someone backtested it with feelings.”  
> — approximately Gilbert Lowell, if he traded synthetic equity curves

## What this is

- **Node + Express** backend: signals, AI orchestration, council decisions, paper portfolio APIs.
- **React (Vite)** dashboard: minimal paper-trading UI — enter a starting balance, hit go, observe prices, position, PnL, and the latest council verdict.

Not a brokerage. Not financial advice. A **simulator** with nerd swagger.

## Quick start

```bash
cp .env.example .env   # fill in keys / URLs as needed
npm install
npm start              # API → http://localhost:3000
```

Dashboard (separate terminal):

```bash
cd dashboard && npm install && npm run dev
# UI → http://localhost:5173  (proxies /paper-sim → :3000)
```

## Paper sim API (sketch)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/paper-sim/init` | `{ "amount": 500, "market": "equities" \| "crypto" }` — seed portfolio (`market` optional; default `equities`) |
| `POST` | `/paper-sim/tick` | advance simulation / council tick |
| `GET`  | `/paper-sim/state` | snapshot + marks |

## Stack ethos

Tri‑Lambda rules: **one repo**, **no drama frameworks**, **two symbols per run** (pick equities or crypto in the UI). Same council pipeline either way — crypto is for nights/weekends when cash equities are quiet.

---

*Fork it. Break it. Improve it. May your unrealized PnL be ever in your favor.*
