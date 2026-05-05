import YahooFinance from "yahoo-finance2";

export const yahoo = new YahooFinance({
  validation: { logErrors: false, logOptionsErrors: false },
});
