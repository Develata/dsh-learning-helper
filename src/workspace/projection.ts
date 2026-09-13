/** Browser/model vocabulary; internal Course identities stay in the established domain only. */
export type ProjectView<T> = T extends readonly (infer V)[] ? ProjectView<V>[] : T extends object
  ? { [K in keyof T as K extends 'courseId' ? 'projectId' : K extends 'course' ? 'project' : K]: ProjectView<Exclude<T[K], undefined>> } : T;
export function projectView<T>(value: T): ProjectView<T> {
  if (Array.isArray(value)) return value.map(projectView) as ProjectView<T>;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) =>
    [key === 'courseId' ? 'projectId' : key === 'course' ? 'project' : key, projectView(item)])) as ProjectView<T>;
  return value as ProjectView<T>;
}
