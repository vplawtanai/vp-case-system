// Caller/RLS-scoped read views; 095 owns the single archive predicate in SQL.
// Writes and Finance/history references continue to use canonical base tables.
export const advisoryOperational = {
  matters: 'advisory_operational_matters',
  issues: 'advisory_operational_issues',
  tasks: 'advisory_operational_tasks',
  time: 'advisory_operational_time',
  advice: 'advisory_operational_advice',
} as const;
