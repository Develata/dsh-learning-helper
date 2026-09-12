import { useEffect, useRef, useState } from 'react';
import { errorText } from './api.js';
export type Resource<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'success'; data: T; refreshing?: boolean };
/** Key fences stale data during the render before an effect's abort cleanup runs. */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>, refresh = 0): Resource<T> {
  const loader = useRef(load); loader.current = load;
  const [state, setState] = useState<{ key: string; value: Resource<T> }>({ key, value: { status: 'loading' } });
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ key, value: previous.key === key && previous.value.status === 'success' ? { ...previous.value, refreshing: true } : { status: 'loading' } }));
    void loader.current(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, value: { status: 'success', data } });
    }, error => {
      if (!controller.signal.aborted) setState({ key, value: { status: 'error', error: errorText(error) } });
    });
    return () => controller.abort();
  }, [key, refresh]);
  return state.key === key ? state.value : { status: 'loading' };
}
