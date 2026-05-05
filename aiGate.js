/**
 * Invoke paid AI only when the tape is stretched (cost control).
 */
export function shouldInvokeAi(signal) {
  const rsi = signal.rsi;
  const bb = signal.bollinger_position;
  return (
    rsi > 65 ||
    rsi < 35 ||
    bb > 0.85 ||
    bb < 0.15
  );
}
