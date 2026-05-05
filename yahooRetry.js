export async function withRetry(
  fn,
  retries = 3,
  delay = 500,
  label = "Request",
) {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;

    console.warn(`Retrying ${label}...`, err.message);

    await new Promise((res) => setTimeout(res, delay));
    return withRetry(fn, retries - 1, delay * 2, label);
  }
}
