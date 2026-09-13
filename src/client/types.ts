import type { StudentDashboard as Dashboard, PublicQuiz as Quiz, QuizResult as Result, QuizSummary } from '../services/student.js';
import type { Course, Submission } from '../domain/model.js';
import type { Source as EvidenceSource } from '../domain/evidence.js';
import type { ProjectView } from '../workspace/projection.js';
export type StudentDashboard = ProjectView<Dashboard>;
export type PublicQuiz = ProjectView<Quiz>;
export type QuizResult = ProjectView<Result>;
export type Source = ProjectView<EvidenceSource>;
export type { QuizSummary, Course, Submission };
export type Section = 'course' | 'plan' | 'progress' | 'quiz';
export interface Navigation { projectId?: string; quizId?: string; section?: Section }
