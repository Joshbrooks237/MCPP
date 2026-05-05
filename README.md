# MCPP

**Multi‑Council Paper Portfolio** — *the revenge of the nerd edition.*

We didn’t come here to lose pocket protectors. We came here to pipe live quotes through a signal stack, let a rotating council of models argue about **AAPL** and **TSLA**, and watch fake money move like it’s rush week for robots.

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
| `POST` | `/paper-sim/init` | `{ "amount": 500 }` — seed portfolio |
| `POST` | `/paper-sim/tick` | advance simulation / council tick |
| `GET`  | `/paper-sim/state` | snapshot + marks |

## Stack ethos

Tri‑Lambda rules: **one repo**, **no drama frameworks**, **two symbols for the demo loop** (AAPL + TSLA). The council pipeline stays the star — we’re just the marching band.

---

*Fork it. Break it. Improve it. May your unrealized PnL be ever in your favor.*
