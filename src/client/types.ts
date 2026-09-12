import type { StudentDashboard, PublicQuiz, QuizResult, QuizSummary } from '../services/student.js';
import type { Course, Submission } from '../domain/model.js';
import type { Source } from '../domain/evidence.js';
export type { StudentDashboard, PublicQuiz, QuizResult, QuizSummary, Course, Submission, Source };
export type Section = 'course' | 'plan' | 'progress' | 'quiz';
export interface Navigation { courseId?: string; quizId?: string; section?: Section }
