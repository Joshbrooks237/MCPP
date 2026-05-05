/**
 * Single-strategy paper portfolio (cash + optional long position).
 */

export function createPaperPortfolio(initialBalance = 10000) {
  let portfolio = {
    balance: initialBalance,
    position: null,
    entryPrice: null,
    trades: [],
    equityCurve: [],
  };

  /**
   * @param {{ action: string, confidence?: number, price: number }} decision
   * @param {{ timestamp: string, strategy: string }} meta
   * @returns {{ pnl: number, traded: boolean }}
   */
  function applyDecision(decision, meta) {
    const action = String(decision.action || "").toUpperCase();
    const price = Number(decision.price);
    let pnl = 0;
    let traded = false;

    if (!Number.isFinite(price) || price <= 0) {
      return { pnl: 0, traded: false };
    }

    if (action === "BUY" && !portfolio.position && portfolio.balance > 0) {
      const shares = portfolio.balance / price;
      portfolio.position = { shares, entryPrice: price };
      portfolio.entryPrice = price;
      portfolio.balance = 0;
      traded = true;
      portfolio.trades.push({
        timestamp: meta.timestamp,
        strategy: meta.strategy,
        regime: meta.regime ?? null,
        action: "BUY",
        price,
        pnl: 0,
        balance_after: portfolio.balance,
      });
      portfolio.equityCurve.push({
        timestamp: meta.timestamp,
        balance: portfolio.balance,
      });
    } else if (action === "SELL" && portfolio.position) {
      const { shares, entryPrice } = portfolio.position;
      const positionSize = shares;
      pnl = (price - entryPrice) * positionSize;
      portfolio.balance = shares * price;
      portfolio.position = null;
      portfolio.entryPrice = null;
      traded = true;
      portfolio.trades.push({
        timestamp: meta.timestamp,
        strategy: meta.strategy,
        regime: meta.regime ?? null,
        action: "SELL",
        price,
        pnl,
        balance_after: portfolio.balance,
      });
      portfolio.equityCurve.push({
        timestamp: meta.timestamp,
        balance: portfolio.balance,
      });
    }

    return { pnl, traded };
  }

  function getOpenPositionValue(markPx) {
    if (!portfolio.position || !Number.isFinite(markPx)) return portfolio.balance;
    return portfolio.balance + portfolio.position.shares * markPx;
  }

  function snapshot() {
    return {
      balance: portfolio.balance,
      position: portfolio.position,
      entryPrice: portfolio.entryPrice,
      trades: [...portfolio.trades],
      equityCurve: [...portfolio.equityCurve],
    };
  }

  function reset(initial = initialBalance) {
    portfolio = {
      balance: initial,
      position: null,
      entryPrice: null,
      trades: [],
      equityCurve: [],
    };
  }

  return {
    applyDecision,
    getOpenPositionValue,
    snapshot,
    reset,
    get raw() {
      return portfolio;
    },
  };
}

/** Live demo singleton (paper sim UI — AAPL / TSLA only). */
export let portfolio = {
  startingBalance: 0,
  balance: 0,
  position: null,
  entryPrice: null,
  trades: [],
  equity: [],
};

export function initializePortfolio(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Starting balance must be a positive number");
  }
  portfolio.startingBalance = n;
  portfolio.balance = n;
  portfolio.position = null;
  portfolio.entryPrice = null;
  portfolio.trades = [];
  portfolio.equity = [{ time: Date.now(), value: n }];
}

export function getDemoUnrealizedPnL(markPriceBySymbol) {
  if (!portfolio.position) return 0;
  const px = markPriceBySymbol[portfolio.position.symbol];
  if (!Number.isFinite(px)) return 0;
  return (px - portfolio.position.entryPrice) * portfolio.position.shares;
}

export function pushDemoEquity(markPriceBySymbol) {
  const unrealized = getDemoUnrealizedPnL(markPriceBySymbol);
  const value = portfolio.balance + unrealized;
  portfolio.equity.push({ time: Date.now(), value });
}

function isoNow() {
  return new Date().toISOString();
}

/**
 * @param {string} action
 * @param {string} symbol
 * @param {Record<string, number>} marks
 */
export function applyPaperSimDecision(action, symbol, marks, regime = null) {
  let act = String(action ?? "HOLD").toUpperCase();
  if (act === "NO TRADE") act = "HOLD";

  const mark = (sym) =>
    Number.isFinite(marks[sym]) ? marks[sym] : marks[symbol];

  if (act === "SELL" && portfolio.position) {
    const sym = portfolio.position.symbol;
    const exitPx = mark(sym);
    const pnl =
      (exitPx - portfolio.position.entryPrice) * portfolio.position.shares;
    portfolio.balance = portfolio.position.shares * exitPx;
    portfolio.trades.push({
      timestamp: isoNow(),
      action: "SELL",
      symbol: sym,
      price: exitPx,
      pnl,
      balance_after: portfolio.balance,
      regime,
    });
    portfolio.position = null;
    portfolio.entryPrice = null;
  }

  if (act === "BUY" && portfolio.balance > 0) {
    if (portfolio.position && portfolio.position.symbol !== symbol) {
      const sym = portfolio.position.symbol;
      const exitPx = mark(sym);
      const pnl =
        (exitPx - portfolio.position.entryPrice) * portfolio.position.shares;
      portfolio.balance = portfolio.position.shares * exitPx;
      portfolio.trades.push({
        timestamp: isoNow(),
        action: "SELL",
        symbol: sym,
        price: exitPx,
        pnl,
        balance_after: portfolio.balance,
        regime,
      });
      portfolio.position = null;
      portfolio.entryPrice = null;
    }
    if (!portfolio.position && portfolio.balance > 0) {
      const px = mark(symbol);
      if (!Number.isFinite(px) || px <= 0) {
        pushDemoEquity(marks);
        return;
      }
      const shares = portfolio.balance / px;
      portfolio.position = { symbol, shares, entryPrice: px };
      portfolio.entryPrice = px;
      portfolio.balance = 0;
      portfolio.trades.push({
        timestamp: isoNow(),
        action: "BUY",
        symbol,
        price: px,
        pnl: 0,
        balance_after: portfolio.balance,
        regime,
      });
    }
  }

  pushDemoEquity(marks);
}

export function getPaperSimSnapshot(marks) {
  const unrealized = getDemoUnrealizedPnL(marks);
  const totalValue = portfolio.balance + unrealized;
  const start = portfolio.startingBalance || 1;
  const pnlDollar = totalValue - start;
  const pnlPct = (pnlDollar / start) * 100;
  return {
    startingBalance: portfolio.startingBalance,
    balance: portfolio.balance,
    position: portfolio.position,
    entryPrice: portfolio.entryPrice,
    trades: [...portfolio.trades],
    equity: [...portfolio.equity],
    unrealizedPnL: unrealized,
    totalValue,
    pnlDollar,
    pnlPct,
  };
}
