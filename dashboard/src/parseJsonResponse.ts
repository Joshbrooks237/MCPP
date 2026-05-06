/**
 * Parse fetch bodies safely — avoids opaque `Unexpected end of JSON input`
 * when the server/proxy returns an empty or HTML/plain-text body.
 */
export async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(
      `Empty response (${res.status} ${res.statusText}). Start the API on port 3000 or check the Vite proxy.`,
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(
      `Invalid or truncated JSON (${res.status}): ${trimmed.slice(0, 200)}${trimmed.length > 200 ? "…" : ""}`,
    );
  }
}
