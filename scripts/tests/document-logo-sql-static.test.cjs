/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {test} = require('node:test');
const {lexical} = require('./receipt-sql-static.test.cjs');
const {artifacts} = require('./document-logo-sql-artifacts.cjs');
const read=p=>fs.readFileSync(p,'utf8');
test('038 artifacts are deterministic, SELECT-only diagnostics, exact rollback-only embedding',()=>{
  for(const [file,content] of Object.entries(artifacts())){
    assert.equal(read(file),content,file);
    const clean=lexical(content);
    if(file.includes('dry_run')){assert.match(clean.trim(),/^BEGIN;/);assert.match(clean.trim(),/ROLLBACK;$/);assert.doesNotMatch(clean,/\bCOMMIT\b/i);}
    else {
      assert.equal(clean.split(';').filter(s=>s.trim()).length,1);
      assert.doesNotMatch(clean,/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do|execute|into)\b/i);
      assert.doesNotMatch(clean,/\b(document_logo_evidence|build_finance_receipt_source|issue_finance_receipt|refresh_finance_receipt_draft)\s*\(/i);
      assert.match(clean,/document_logo_immutability_(?:preflight|verification)_pass/);
    }
  }
});
test('037 stays byte-identical; 038 changes only source schema and logo evidence, not financial body',()=>{
  const old=read('supabase/migrations/202607180037_create_finance_receipt_foundation.sql');
  assert.equal(crypto.createHash('sha256').update(old).digest('hex'),'cc496e113699120f0cf5c322253a361fe3752485f65170a2fc4be670b4fb91ba');
  const sql=read('supabase/migrations/202607180038_add_immutable_document_logo_evidence.sql');
  const source=s=>s.match(/as \$receipt_source\$([\s\S]*?)\$receipt_source\$/)[1];
  assert.equal(source(sql).replace("'schema_version',2,'document_kind','receipt'","'schema_version',1,'document_kind','receipt'")
    .replace(",\n    'logo_asset',public.document_logo_evidence(v_company->>'logo_storage_path')",''),source(old));
  assert.doesNotMatch(lexical(sql),/\b(insert|update|delete|truncate)\s+(?:into|from|table)?\s*(?:public\.)?finance_\w+/i);
  assert.equal((sql.match(/create or replace function/g)||[]).length,1);
});
test('038 uses policy-only managed Storage DDL without ownership, trigger, role or configuration escalation',()=>{
  const sql=read('supabase/migrations/202607180038_add_immutable_document_logo_evidence.sql');
  const clean=lexical(sql);
  assert.doesNotMatch(clean,/\b(?:alter|drop|truncate)\s+(?:table|schema)?\s*storage\./i);
  assert.doesNotMatch(clean,/\bcreate\s+trigger\b[^;]*\bon\s+storage\./i);
  assert.doesNotMatch(clean,/\b(?:set\s+(?:local\s+)?role|alter\s+role|alter\s+system|owner\s+to|set_config|grant)\b/i);
  assert.doesNotMatch(sql,/protect_document_logo|for share;\s*\n\s*if not found/i);
  assert.equal((clean.match(/create policy/gi)||[]).length,3);
  assert.match(sql,/DOCUMENT_LOGO_STORAGE_POLICY_PERMISSION_REQUIRED/);
  assert.match(sql,/supautils\.policy_grants/);
});
