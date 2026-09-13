/** Polls until `condition` holds, for async work that exposes no handle to await. */
export const waitFor = async (condition: () => boolean, timeoutMs = 1000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition never became true');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};
