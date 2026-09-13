import { existsSync, renameSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createCourseSchema, idSchema } from '../domain/model.js';
import { LearningError } from '../domain/errors.js';
import { LearningService } from '../services/learning.js';
import { WorkspaceEvidenceStore } from '../providers/workspace-evidence.js';
import { WorkspaceLearningStore } from '../providers/workspace-state.js';
import { validate } from '../services/evidence.js';
import { canonicalRoot, readWorkspaceFile, workspaceDirectory, workspacePath, writeWorkspaceFile, syncDirectory } from './files.js';

export const projectInputSchema = createCourseSchema.omit({ id: true });
export const manifestSchema = projectInputSchema.extend({ schemaVersion: z.literal(2), projectId: idSchema });
export type ProjectManifest = z.infer<typeof manifestSchema>;
export interface WorkspaceContext { readonly root: string; readonly projectId: string }
/** Structural subset of the official, header-validated Workspace projection. */
export interface WorkspaceMembership { readonly path: string; readonly sessionIds: readonly string[] }
export class WorkspaceResolver {
  constructor(private readonly list: () => readonly WorkspaceMembership[]) {}
  resolve(sessionId: string | undefined): string {
    if (!sessionId || !idSchema.safeParse(sessionId).success) throw new LearningError('unavailable', 'Learning Helper requires an active Workspace.');
    const matches = this.list().filter(w => w.sessionIds.includes(sessionId));
    if (matches.length !== 1) throw new LearningError('unavailable', 'Learning Helper requires an active Workspace.');
    return canonicalRoot(matches[0]!.path);
  }
}
export function readManifest(root: string): ProjectManifest | null {
  const path = workspacePath(root, '.learning-helper/manifest.json');
  if (!existsSync(path)) return null;
  return validate(manifestSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readWorkspaceFile(root, '.learning-helper/manifest.json', 32_768))));
}
/** Staging remains inspectable after interruption. Never adopts/deletes an unknown directory. */
export async function initializeProject(root: string, input: unknown): Promise<ProjectManifest> {
  const metadata = validate(projectInputSchema, input);
  const existing = readManifest(root);
  if (existing) {
    const { schemaVersion: _v, projectId: _id, ...current } = existing;
    if (JSON.stringify(current) !== JSON.stringify(metadata)) throw new LearningError('conflict', 'Workspace already initialized with different metadata');
    return existing;
  }
  const destination = workspacePath(root, '.learning-helper');
  if (existsSync(destination)) throw new LearningError('conflict', 'Existing .learning-helper requires explicit recovery; it was not modified');
  const projectId = `project_${randomUUID()}`;
  const manifest: ProjectManifest = { ...metadata, schemaVersion: 2, projectId };
  if (readdirSync(root).filter(p => p.startsWith('.learning-helper-init-')).length >= 8) throw new LearningError('conflict', 'Interrupted initialization stages need explicit recovery before retry');
  const staging = `.learning-helper-init-${randomUUID()}`;
  workspaceDirectory(root, staging);
  writeWorkspaceFile(root, `${staging}/.gitignore`, '*\n!.gitignore\n');
  writeWorkspaceFile(root, `${staging}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  writeWorkspaceFile(root, `${staging}/config.json`, '{"schemaVersion":2,"documentParsing":{"pdfMode":"auto","mineru":{"enabled":false}}}\n');
  const store = new WorkspaceLearningStore(workspacePath(root, `${staging}/state.db`), projectId);
  try { await new LearningService(store).createCourse({ ...metadata, id: projectId }); }
  finally { await store.close(); }
  const evidence = new WorkspaceEvidenceStore(root, projectId, { create: true, databasePath: `${staging}/evidence.db` }); evidence.close();
  workspaceDirectory(root, 'learning-assets');
  // rename cannot replace a nonempty initialized directory. Check the absent target again.
  if (existsSync(workspacePath(root, '.learning-helper'))) throw new LearningError('conflict', 'Workspace initialization raced; staged data retained');
  renameSync(workspacePath(root, staging), destination); syncDirectory(root);
  return manifest;
}
