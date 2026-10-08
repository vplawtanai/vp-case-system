export const DECISIONS = ['waiting', 'continue', 'end'] as const;
export const OBJECTIVES = ['achieved', 'partial', 'not_achieved', 'not_applicable'] as const;
export type Decision = { id: string; sequence_no: number; decision: typeof DECISIONS[number]; confirmed_on: string | null; note: string | null; recorded_by: string; recorded_at: string; author_name: string };
export type Rescue = { id: string; escalated_to: string; subject: string; reason: string; occurred_at: string; status: 'open' | 'resolved'; resolution: string | null; resolved_at: string | null; requested_by: string; recorded_at: string; updated_at: string; version: number; requester_name: string; recipient_name: string; editor_name: string; resolver_name: string | null };
export type CloseReview = { id: string; decision_id: string; objective: typeof OBJECTIVES[number]; variance: string | null; lessons: string | null; knowledge: string | null; document_ref: string | null; closed_at: string; recorded_at: string; updated_at: string; version: number; author_name: string; editor_name: string; team_evidence: { person_id: string; team_role: string; name: string }[] };
export type EngagementData = { decisions: Decision[]; rescues: Rescue[]; reviews: CloseReview[] };
export function engagementError(message: string) {
 return ['FORBIDDEN', 'NOT_FOUND', 'STALE', 'INVALID_INPUT', 'INVALID_DATE', 'PERSON_INELIGIBLE', 'REQUEST_CONFLICT', 'DECISION_APPEND_ONLY', 'ALREADY_RESOLVED', 'END_REQUIRED'].map(s=>'CASE100_'+s).find(s=>message.includes(s)) || 'Engagement could not be saved. Please try again.';
}
export function localDateTime(value: string) {
 const date = new Date(value);
 return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
