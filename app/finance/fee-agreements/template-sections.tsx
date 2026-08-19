import { Fragment, type ReactNode } from "react";

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const asArray = (value: unknown): Json[] => Array.isArray(value) ? value.map(asObject) : [];
const asText = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value : fallback;
const bySortOrder = (left: Json, right: Json) => Number(left.sort_order || 0) - Number(right.sort_order || 0);
const conditionAllows = (value: unknown) => asObject(value).result !== false;

export function templateDisplayName(template: Json) {
  const code = asText(template.template_code, "Template");
  const version = Number(template.version_no || 0);
  const name = asText(template.template_name);
  return [code, version ? `v${version}` : "", name].filter(Boolean).join(" — ");
}

export function ResolvedTemplateSections({
  template,
  variables,
  showProvenance = false,
  afterSection,
}: {
  template: Json;
  variables: Record<string, string>;
  showProvenance?: boolean;
  afterSection?: (section: Json) => ReactNode;
}) {
  const sections = asArray(template.sections)
    .filter((section) => !["preamble", "execution"].includes(asText(section.section_kind)))
    .filter((section) => conditionAllows(section.condition_evaluation))
    .sort(bySortOrder);

  if (!sections.length) return <p style={muted}>ไม่พบส่วนข้อกำหนดที่ resolve จากแม่แบบ</p>;

  return <>{sections.map((section) => {
    const slots = asArray(section.slots).filter(slotIsRendered).sort(bySortOrder);
    const visibleSlotIds = new Set(slots.map((slot) => asText(slot.slot_id)).filter(Boolean));
    const customClauses = asArray(section.custom_clauses).sort(bySortOrder);
    const anchored = new Map<string, Json[]>();
    const unanchored: Json[] = [];
    customClauses.forEach((clause) => {
      const anchor = asText(clause.anchor_template_slot_id);
      if (!anchor || !visibleSlotIds.has(anchor)) {
        unanchored.push(clause);
        return;
      }
      anchored.set(anchor, [...(anchored.get(anchor) || []), clause]);
    });

    return <section key={asText(section.section_id, asText(section.section_code))} style={sectionStyle} data-section-code={asText(section.section_code)}>
      <h2 className="fee-agreement-section-title" style={sectionTitle}>{displayTitle(section)}</h2>
      {slots.map((slot) => <Fragment key={asText(slot.slot_id, asText(slot.slot_code))}>
        <ResolvedClause clause={slot} variables={variables} showProvenance={showProvenance} />
        {(anchored.get(asText(slot.slot_id)) || []).map((clause) => <ResolvedClause key={asText(clause.custom_clause_id)} clause={clause} variables={variables} showProvenance={showProvenance} />)}
      </Fragment>)}
      {unanchored.map((clause) => <ResolvedClause key={asText(clause.custom_clause_id)} clause={clause} variables={variables} showProvenance={showProvenance} />)}
      {!slots.length && !customClauses.length ? <p style={muted}>ส่วนนี้ยังไม่มีข้อความที่ใช้กับข้อตกลง</p> : null}
      {afterSection?.(section)}
    </section>;
  })}</>;
}

export function TemplateAgreementChanges({ template }: { template: Json }) {
  const changes = asArray(template.sections).flatMap((section) => {
    const sectionTitle = displayTitle(section);
    const slotChanges = asArray(section.slots)
      .filter((slot) => ["document_override", "suppressed_template_clause"].includes(asText(slot.origin_type)))
      .map((slot) => ({
        key: asText(slot.slot_id),
        title: asText(slot.title, asText(slot.slot_code, "ข้อสัญญา")),
        sectionTitle,
        kind: asText(slot.origin_type) === "document_override" ? "ใช้ข้อความทดแทน" : "งดใช้ข้อความจากแม่แบบ",
        reason: asText(asObject(asText(slot.origin_type) === "document_override" ? slot.override_evidence : slot.suppression_evidence).reason),
      }));
    const customChanges = asArray(section.custom_clauses).map((clause) => ({
      key: asText(clause.custom_clause_id),
      title: asText(clause.title, "ข้อความเฉพาะข้อตกลง"),
      sectionTitle,
      kind: "ข้อความเฉพาะข้อตกลง",
      reason: asText(clause.reason),
    }));
    return [...slotChanges, ...customChanges];
  });

  if (!changes.length) return <p style={muted}>ไม่มีข้อยกเว้นหรือข้อความเฉพาะข้อตกลง</p>;
  return <div style={changeList}>{changes.map((change) => <div key={`${change.kind}-${change.key}`} style={changeRow}>
    <strong>{change.title}</strong>
    <span>{change.kind} · {change.sectionTitle}</span>
    {change.reason ? <span>เหตุผล: {change.reason}</span> : null}
  </div>)}</div>;
}

export function resolvedVariableMap(value: unknown): Record<string, string> {
  return Array.isArray(value) ? value.reduce<Record<string, string>>((result, entry) => {
    const row = asObject(entry);
    const key = asText(row.variable_key);
    if (!key || row.resolution_result === "unresolved") return result;
    result[key] = asText(row.formatted_value, asText(row.value));
    return result;
  }, {}) : {};
}

function slotIsRendered(slot: Json) {
  if (!conditionAllows(slot.condition_evaluation)) return false;
  if (asText(slot.origin_type) === "suppressed_template_clause") return false;
  const alternative = asObject(slot.alternative_selection);
  return !Object.keys(alternative).length || alternative.selected !== false;
}

function ResolvedClause({ clause, variables, showProvenance }: { clause: Json; variables: Record<string, string>; showProvenance: boolean }) {
  const content = interpolateControlledVariables(asText(clause.content, "-"), variables);
  const origin = asText(clause.origin_type);
  return <div style={clauseStyle} data-origin-type={origin || undefined}>
    {showProvenance ? <h3 style={clauseTitleStyle}>{clauseTitle(clause)}</h3> : null}
    {showProvenance && origin === "document_override" ? <div style={provenance}>ข้อความทดแทนเฉพาะข้อตกลงนี้</div> : null}
    {showProvenance && origin === "document_custom_clause" ? <div style={provenance}>ข้อความเฉพาะข้อตกลงนี้</div> : null}
    <p style={clauseContent}>{content}</p>
  </div>;
}

function interpolateControlledVariables(content: string, variables: Record<string, string>) {
  return content.replace(/\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g, (_, key: string) => variables[key] || `[${key}: ยังไม่มีข้อมูล]`);
}

function displayTitle(row: Json) {
  const prefix = asText(row.display_label, asText(row.display_number));
  const title = asText(row.title, asText(row.section_code, "ข้อกำหนด"));
  return prefix ? `${prefix} ${title}` : title;
}

function clauseTitle(clause: Json) {
  const title = asText(clause.title, asText(clause.slot_code, "ข้อกำหนด"));
  if (asText(clause.numbering_style) === "none") return title;
  const prefix = asText(clause.display_label, asText(clause.display_number));
  return prefix ? `${prefix} ${title}` : title;
}

const sectionStyle = { margin: "20px 0", breakInside: "auto" as const };
const sectionTitle = { color: "#15803d", fontSize: 17, borderBottom: "1px solid #bbf7d0", paddingBottom: 6, margin: "0 0 10px", breakAfter: "avoid" as const };
const clauseStyle = { padding: "6px 0 8px", borderBottom: "1px solid #e5e7eb", breakInside: "auto" as const };
const clauseTitleStyle = { margin: "0 0 5px", fontSize: 14, color: "#1f2937" };
const clauseContent = { whiteSpace: "pre-wrap" as const, lineHeight: 1.68, margin: 0, orphans: 3, widows: 3 };
const muted = { color: "#64748b", fontSize: 13 };
const provenance = { color: "#166534", fontSize: 12, marginBottom: 5 };
const changeList = { display: "grid", gap: 10 };
const changeRow = { display: "grid", gap: 3, borderLeft: "3px solid #86efac", padding: "8px 10px", background: "#f8fafc", fontSize: 13 };
