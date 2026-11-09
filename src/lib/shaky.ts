// Whether a lookup ran into trouble along the way: a source that was down, slow to answer or asking us to slow down,
// as opposed to one that answered and simply had nothing. An answer put together while a source was in trouble is
// missing pieces it may have next time, so it isn't kept.

import { AsyncLocalStorage } from "node:async_hooks";

const trouble = new AsyncLocalStorage<{ shaky: boolean }>();

// runs a lookup, and says whether any source it asked was in trouble
export async function watch<T>(work: () => Promise<T>): Promise<{ value: T; shaky: boolean }> {
  const s = { shaky: false };
  const value = await trouble.run(s, work);
  return { value, shaky: s.shaky };
}

// a source failed to answer: no connection, a timeout, a server error or a rate limit (a 404 is an answer)
export function shaky() {
  const s = trouble.getStore();
  if (s) s.shaky = true;
}
export const troubled = (status: number) => status === 429 || status >= 500;
