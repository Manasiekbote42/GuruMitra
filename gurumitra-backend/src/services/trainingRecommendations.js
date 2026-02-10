/**
 * Rule-based training recommendation engine (Phase 4).
 * Deterministic: uses question_count, example_count, structure_score, interaction_score from latest analysis.
 */

const THRESHOLDS = {
  interaction_score_min: 3,
  structure_score_min: 3,
  example_count_min: 1,
  question_count_min: 2,
};

const IMPROVEMENT_AREAS = {
  interactive_teaching: {
    reasonKey: 'interaction_low',
    reasonText: 'Your session had limited student interaction. This module will help you engage students more.',
  },
  lesson_structuring: {
    reasonKey: 'structure_low',
    reasonText: 'Your lesson structure could be clearer. This module will help you organize content and flow.',
  },
  real_life_examples: {
    reasonKey: 'examples_low',
    reasonText: 'Using more real-life examples can help students connect ideas. This module shows you how.',
  },
  effective_questions: {
    reasonKey: 'questions_low',
    reasonText: 'Asking more questions helps check understanding. This module improves your questioning technique.',
  },
};

/**
 * @param {object} content - content_metrics or analysis_result.metrics.content
 * @returns {{ areas: string[], reasons: Record<string, string> }}
 */
export function getRecommendedAreas(content) {
  const metrics = content && typeof content === 'object' ? content : {};
  const interaction_score = parseFloat(metrics.interaction_score);
  const structure_score = parseFloat(metrics.structure_score);
  const example_count = typeof metrics.example_count === 'number' ? metrics.example_count : parseInt(metrics.example_count, 10) || 0;
  const question_count = typeof metrics.question_count === 'number' ? metrics.question_count : parseInt(metrics.question_count, 10) || 0;

  const areas = [];
  const reasons = {};

  if (!Number.isNaN(interaction_score) && interaction_score < THRESHOLDS.interaction_score_min) {
    areas.push('interactive_teaching');
    reasons.interactive_teaching = IMPROVEMENT_AREAS.interactive_teaching.reasonText;
  }
  if (!Number.isNaN(structure_score) && structure_score < THRESHOLDS.structure_score_min) {
    areas.push('lesson_structuring');
    reasons.lesson_structuring = IMPROVEMENT_AREAS.lesson_structuring.reasonText;
  }
  if (example_count < THRESHOLDS.example_count_min) {
    areas.push('real_life_examples');
    reasons.real_life_examples = IMPROVEMENT_AREAS.real_life_examples.reasonText;
  }
  if (question_count < THRESHOLDS.question_count_min) {
    areas.push('effective_questions');
    reasons.effective_questions = IMPROVEMENT_AREAS.effective_questions.reasonText;
  }

  return { areas, reasons };
}
