import { runBacktest } from "./backtest.js";

async function main() {
  const tsla = await runBacktest("TSLA");
  const aapl = await runBacktest("AAPL");

  console.log("TSLA:", tsla);
  console.log("AAPL:", aapl);
}

main();
