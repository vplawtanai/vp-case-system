-- SELECT ONLY. Immediate post-installation evidence; not an ongoing empty-data gate after go-live.
-- Exact schema/security/unchanged dependency checks are in the bound verify_case_defendant_104.sql.
WITH counts(name, row_count) AS (
 SELECT 'case_defendant_representations', count(*) FROM public.case_defendant_representations
 UNION ALL SELECT 'case_answer_filings', count(*) FROM public.case_answer_filings
 UNION ALL SELECT 'case_answer_filing_parties', count(*) FROM public.case_answer_filing_parties
 UNION ALL SELECT 'case_extension_groups', count(*) FROM public.case_extension_groups
 UNION ALL SELECT 'case_extension_group_parties', count(*) FROM public.case_extension_group_parties
 UNION ALL SELECT 'case_counterclaims', count(*) FROM public.case_counterclaims
 UNION ALL SELECT 'case_counterclaim_parties', count(*) FROM public.case_counterclaim_parties
 UNION ALL SELECT '104_business_receipts', count(*) FROM public.case_service_events WHERE action LIKE 'case104_%'
 UNION ALL SELECT '104_audit_rows', count(*) FROM public.case_audit_logs WHERE note LIKE 'case104_%'
 UNION ALL SELECT 'defendant_flow_instances', count(*) FROM public.case_flow_instances WHERE template_id='civil_ordinary_defendant_v1'
 UNION ALL SELECT 'defendant_flow_transitions', count(*) FROM public.case_flow_transitions WHERE template_id='civil_ordinary_defendant_v1'
), configuration AS (
 SELECT (SELECT count(*) FROM public.case_flow_versions WHERE id='civil_ordinary_defendant_v1') version_count,
 (SELECT jsonb_agg(stage_key ORDER BY ordinal) FROM public.case_flow_stages WHERE template_id='civil_ordinary_defendant_v1') stages
)
SELECT jsonb_build_object(
 'gate_pass',NOT EXISTS(SELECT 1 FROM counts WHERE row_count<>0) AND version_count=1 AND stages='["D-CIV-01","D-CIV-02","D-CIV-03"]'::jsonb,
 'new_business_rows_zero',NOT EXISTS(SELECT 1 FROM counts WHERE row_count<>0),
 'counts',(SELECT jsonb_object_agg(name,row_count ORDER BY name) FROM counts),
 'defendant_template_versions',version_count,'defendant_stages',stages,
 'business_rpc_executed',false,'select_only',true
) AS case104_installation FROM configuration;
