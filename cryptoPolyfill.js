/**
 * Node 18: Web Crypto is not on globalThis by default (Node 19+ adds it).
 * Undici/fetch and some HTTP stacks assume `globalThis.crypto` exists.
 */
import { webcrypto } from "node:crypto";

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = webcrypto;
}
