/** Bounds even providers that ignore the cooperative signal. Late results cannot enter the caller's commit path. */
export async function cancelled<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let stop: (() => void) | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      stop = () => reject(signal.reason); signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
    })]);
  } finally { if (stop) signal.removeEventListener('abort', stop); }
}
