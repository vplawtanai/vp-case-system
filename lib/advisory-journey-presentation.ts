import type {JourneyDefinition} from './advisory-flexible-journey';
import type {JourneyPathVisit} from './advisory-controlled-journey';

// Display only: never change the stored global sequence or visit records.
export function stageVisitNumbers(path: JourneyPathVisit[]) {
  const counts = new Map<string, number>();
  return path.map(visit => {
    const number = (counts.get(visit.stage_id) || 0) + 1;
    counts.set(visit.stage_id, number);
    return number;
  });
}

export type JourneyIssue = {stage: string; outcome?: number; problem: 'missingStageName'|'missingOutcomeName'|'missingOutcomes'|'invalidTarget'|'unreachableStage'|'noClosingRoute'|'closingOutcomes'};
// Explain the existing FJ-2 publication rules without changing the RPC contract.
export function journeyIssues(definition: JourneyDefinition): JourneyIssue[] {
  if (definition.format !== 2) return [];
  const stages = definition.stages, keys = new Set(stages.map(s => s.key));
  const issues: JourneyIssue[] = [];
  for (const stage of stages) {
    if (!stage.name_th.trim() || !stage.name_en.trim()) issues.push({stage:stage.key, problem:'missingStageName'});
    if (stage.key === 'close' && stage.outcomes?.length) issues.push({stage:stage.key, problem:'closingOutcomes'});
    if (stage.key !== 'close' && (!stage.outcomes?.length || stage.outcomes.length > 8)) issues.push({stage:stage.key, problem:'missingOutcomes'});
    stage.outcomes?.forEach((outcome, index) => {
      if (!outcome.name_th.trim() || !outcome.name_en.trim()) issues.push({stage:stage.key, outcome:index+1, problem:'missingOutcomeName'});
      if (!keys.has(outcome.target)) issues.push({stage:stage.key, outcome:index+1, problem:'invalidTarget'});
    });
  }
  const reached = new Set([stages[0]?.key]), closing = new Set(['close']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const stage of stages) for (const outcome of stage.outcomes || []) {
      if (!keys.has(outcome.target)) continue;
      if (reached.has(stage.key) && !reached.has(outcome.target)) { reached.add(outcome.target); changed = true; }
      if (closing.has(outcome.target) && !closing.has(stage.key)) { closing.add(stage.key); changed = true; }
    }
  }
  for (const stage of stages) {
    if (!reached.has(stage.key)) issues.push({stage:stage.key, problem:'unreachableStage'});
    if (!closing.has(stage.key)) issues.push({stage:stage.key, problem:'noClosingRoute'});
  }
  return issues;
}

// Forward ranks are a visual layout only. Back edges remain explicit loop arrows.
export function journeyLayout(definition: JourneyDefinition) {
  const stages = definition.stages;
  const indices = new Map(stages.map((s,i) => [s.key,i]));
  const ranks = stages.map(() => 0);
  stages.forEach((stage,i) => stage.outcomes?.forEach(outcome => {
    const target = indices.get(outcome.target);
    if (target !== undefined && target > i) ranks[target] = Math.max(ranks[target], ranks[i]+1);
  }));
  const rows = new Map<number, number[]>();
  ranks.forEach((rank,i) => rows.set(rank,[...(rows.get(rank)||[]),i]));
  const width = Math.max(420, Math.max(1,...Array.from(rows.values(),r=>r.length))*180+160);
  const nodes = stages.map((stage,i) => {
    const row = rows.get(ranks[i])!, col = row.indexOf(i);
    return {key:stage.key, x:width/2+(col-(row.length-1)/2)*180, y:24+ranks[i]*156, rank:ranks[i]};
  });
  return {width, height:Math.max(220, 140+Math.max(0,...ranks)*156), nodes};
}
