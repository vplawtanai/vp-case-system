"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

type EnforcementItem = {
  id: string;
  case_id: number;

  party_label?: string | null;
  party_other?: string | null;

  judgment_date?: string | null;

  command_service_date?: string | null;
  service_method?: string | null;
  service_result?: string | null;

  compliance_days?: number | null;
  extra_days?: number | null;
  original_due_date?: string | null;
  final_due_date?: string | null;

  writ_request_date?: string | null;
  writ_issued_date?: string | null;

  status?: string | null;
  note?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type AssetItem = {
  id: string;
  enforcement_id?: string | null;
  case_id: number;

  search_agency?: string | null;
  search_office?: string | null;
  search_date?: string | null;
  search_result?: string | null;

  asset_type?: string | null;
  asset_description?: string | null;
  asset_identifier?: string | null;
  asset_owner?: string | null;
  estimated_value?: number | null;

  client_notified_date?: string | null;
  client_approval_status?: string | null;
  client_approval_date?: string | null;
  client_reason?: string | null;

  seizure_request_date?: string | null;
  seizure_date?: string | null;
  seizure_status?: string | null;

  auction_announcement_date?: string | null;
  auction_date?: string | null;
  auction_round?: number | null;
  auction_status?: string | null;
  auction_result?: string | null;
  sale_amount?: number | null;

  note?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type EnforcementForm = {
  party_label: string;
  party_other: string;

  judgment_date: string;

  command_service_date: string;
  service_method: string;
  service_result: string;

  compliance_days: string;
  extra_days: string;
  original_due_date: string;
  final_due_date: string;

  writ_request_date: string;
  writ_issued_date: string;

  status: string;
  note: string;
};

type AssetForm = {
  enforcement_id: string;

  search_agency: string;
  search_office: string;
  search_date: string;
  search_result: string;

  asset_type: string;
  asset_description: string;
  asset_identifier: string;
  asset_owner: string;
  estimated_value: string;

  client_notified_date: string;
  client_approval_status: string;
  client_approval_date: string;
  client_reason: string;

  seizure_request_date: string;
  seizure_date: string;
  seizure_status: string;

  auction_announcement_date: string;
  auction_date: string;
  auction_round: string;
  auction_status: string;
  auction_result: string;
  sale_amount: string;

  note: string;
};

type Props = {
  caseId: string;
};

const partyOptions = [
  { value: "defendant", label: "จำเลย" },
  { value: "defendant_1", label: "จำเลยที่ 1" },
  { value: "defendant_2", label: "จำเลยที่ 2" },
  { value: "defendant_3", label: "จำเลยที่ 3" },
  { value: "defendant_4", label: "จำเลยที่ 4" },
  { value: "other", label: "อื่นๆ" },
];

const serviceMethodOptions = [
  { value: "personal", label: "รับเอง" },
  { value: "posted", label: "ปิดหมาย" },
  { value: "other", label: "อื่นๆ" },
];

const serviceResultOptions = [
  { value: "pending", label: "รอผลการส่ง" },
  { value: "served", label: "ส่งได้" },
  { value: "failed", label: "ส่งไม่ได้" },
];

const enforcementStatusOptions = [
  { value: "not_started", label: "ยังไม่ส่งคำบังคับ" },
  { value: "waiting_due", label: "ส่งแล้ว รอครบกำหนด" },
  { value: "ready_for_writ", label: "พร้อมขอออกหมายบังคับคดี" },
  { value: "writ_requested", label: "ยื่นขอออกหมายแล้ว" },
  { value: "writ_issued", label: "ออกหมายบังคับคดีแล้ว" },
  { value: "asset_searching", label: "กำลังสืบทรัพย์" },
  { value: "no_asset_found", label: "ไม่พบทรัพย์" },
  { value: "asset_found_waiting_approval", label: "พบทรัพย์ รออนุมัติลูกค้า" },
  { value: "client_rejected", label: "ลูกค้าไม่อนุมัติยึด" },
  { value: "approved_waiting_seizure", label: "อนุมัติแล้ว รอยึด" },
  { value: "seized_waiting_auction", label: "ยึดแล้ว รอขาย" },
  { value: "sold", label: "ขายแล้ว" },
  { value: "closed", label: "ปิดงานบังคับคดี" },
];

const searchAgencyOptions = [
  { value: "land", label: "กรมที่ดิน / สำนักงานที่ดิน" },
  { value: "transport", label: "กรมการขนส่งทางบก" },
  { value: "other", label: "อื่นๆ" },
];

const searchResultOptions = [
  { value: "pending", label: "รอผล" },
  { value: "not_found", label: "ไม่พบทรัพย์" },
  { value: "found", label: "พบทรัพย์" },
];

const assetTypeOptions = [
  { value: "land", label: "ที่ดิน" },
  { value: "car", label: "รถยนต์" },
  { value: "motorcycle", label: "รถจักรยานยนต์" },
  { value: "other", label: "อื่นๆ" },
];

const clientApprovalOptions = [
  { value: "not_notified", label: "ยังไม่ได้แจ้งลูกค้า" },
  { value: "waiting", label: "รออนุมัติลูกค้า" },
  { value: "approved", label: "ลูกค้าอนุมัติให้ยึด" },
  { value: "rejected", label: "ลูกค้าไม่อนุมัติให้ยึด" },
  { value: "not_worth", label: "ไม่คุ้มค่าใช้จ่าย / ปิดรายการ" },
];

const seizureStatusOptions = [
  { value: "not_started", label: "ยังไม่ยื่นยึด" },
  { value: "requested", label: "ยื่นคำขอยึดแล้ว" },
  { value: "scheduled", label: "นัดยึดแล้ว" },
  { value: "seized", label: "ยึดสำเร็จ" },
  { value: "failed", label: "ยึดไม่ได้" },
];

const auctionStatusOptions = [
  { value: "not_started", label: "ยังไม่ประกาศขาย" },
  { value: "announced", label: "ประกาศขายแล้ว" },
  { value: "scheduled", label: "มีวันขายแล้ว" },
  { value: "sold", label: "ขายได้" },
  { value: "not_sold", label: "ขายไม่ได้" },
  { value: "postponed", label: "เลื่อนขาย" },
  { value: "cancelled", label: "งดขาย" },
];

const emptyEnforcementForm: EnforcementForm = {
  party_label: "defendant",
  party_other: "",

  judgment_date: "",

  command_service_date: "",
  service_method: "personal",
  service_result: "pending",

  compliance_days: "30",
  extra_days: "0",
  original_due_date: "",
  final_due_date: "",

  writ_request_date: "",
  writ_issued_date: "",

  status: "not_started",
  note: "",
};

const emptyAssetForm: AssetForm = {
  enforcement_id: "",

  search_agency: "land",
  search_office: "",
  search_date: "",
  search_result: "pending",

  asset_type: "land",
  asset_description: "",
  asset_identifier: "",
  asset_owner: "",
  estimated_value: "",

  client_notified_date: "",
  client_approval_status: "not_notified",
  client_approval_date: "",
  client_reason: "",

  seizure_request_date: "",
  seizure_date: "",
  seizure_status: "not_started",

  auction_announcement_date: "",
  auction_date: "",
  auction_round: "",
  auction_status: "not_started",
  auction_result: "",
  sale_amount: "",

  note: "",
};

export default function EnforcementSection({ caseId }: Props) {
  const caseIdNumber = Number(caseId);

  const [enforcements, setEnforcements] = useState<EnforcementItem[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [savingEnforcement, setSavingEnforcement] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);

  const [showEnforcementForm, setShowEnforcementForm] = useState(false);
  const [editingEnforcementId, setEditingEnforcementId] = useState<string | null>(
    null
  );
  const [enforcementForm, setEnforcementForm] =
    useState<EnforcementForm>(emptyEnforcementForm);

  const [showAssetForm, setShowAssetForm] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState<AssetForm>(emptyAssetForm);

  const loadData = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const [enforcementRes, assetRes] = await Promise.all([
        supabase
          .from("case_enforcements")
          .select("*")
          .eq("case_id", caseIdNumber)
          .order("created_at", { ascending: true }),

        supabase
          .from("case_enforcement_assets")
          .select("*")
          .eq("case_id", caseIdNumber)
          .order("created_at", { ascending: true }),
      ]);

      if (enforcementRes.error) {
        alert(
          "Load enforcements failed:\n" +
            JSON.stringify(enforcementRes.error, null, 2)
        );
        setEnforcements([]);
        return;
      }

      if (assetRes.error) {
        alert(
          "Load enforcement assets failed:\n" +
            JSON.stringify(assetRes.error, null, 2)
        );
        setAssets([]);
        return;
      }

      setEnforcements((enforcementRes.data || []) as EnforcementItem[]);
      setAssets((assetRes.data || []) as AssetItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const summary = useMemo(() => {
    const readyForWrit = enforcements.filter(
      (item) =>
        item.status === "ready_for_writ" ||
        (!!item.final_due_date && diffDaysFromToday(item.final_due_date) < 0)
    ).length;

    const writIssued = enforcements.filter(
      (item) => item.status === "writ_issued" || !!item.writ_issued_date
    ).length;

    const assetsFound = assets.filter(
      (item) => item.search_result === "found"
    ).length;

    const waitingApproval = assets.filter(
      (item) => item.client_approval_status === "waiting"
    ).length;

    const auctionSoon = assets.filter((item) => {
      if (!item.auction_date) return false;
      const diff = diffDaysFromToday(item.auction_date);
      return diff >= 0 && diff <= 7;
    }).length;

    return {
      readyForWrit,
      writIssued,
      assetsFound,
      waitingApproval,
      auctionSoon,
    };
  }, [enforcements, assets]);

  const handleServiceMethodChange = (value: string) => {
    const nextExtraDays = value === "posted" ? "15" : "0";

    const computed = computeDueDates(
      enforcementForm.command_service_date,
      enforcementForm.compliance_days,
      nextExtraDays
    );

    setEnforcementForm({
      ...enforcementForm,
      service_method: value,
      extra_days: nextExtraDays,
      original_due_date: computed.originalDueDate,
      final_due_date: computed.finalDueDate,
    });
  };

  const handleCommandDateChange = (value: string) => {
    const computed = computeDueDates(
      value,
      enforcementForm.compliance_days,
      enforcementForm.extra_days
    );

    setEnforcementForm({
      ...enforcementForm,
      command_service_date: value,
      original_due_date: computed.originalDueDate,
      final_due_date: computed.finalDueDate,
    });
  };

  const handleComplianceDaysChange = (value: string) => {
    const sanitized = sanitizeNumberString(value);

    const computed = computeDueDates(
      enforcementForm.command_service_date,
      sanitized,
      enforcementForm.extra_days
    );

    setEnforcementForm({
      ...enforcementForm,
      compliance_days: sanitized,
      original_due_date: computed.originalDueDate,
      final_due_date: computed.finalDueDate,
    });
  };

  const handleExtraDaysChange = (value: string) => {
    const sanitized = sanitizeNumberString(value);

    const computed = computeDueDates(
      enforcementForm.command_service_date,
      enforcementForm.compliance_days,
      sanitized
    );

    setEnforcementForm({
      ...enforcementForm,
      extra_days: sanitized,
      original_due_date: computed.originalDueDate,
      final_due_date: computed.finalDueDate,
    });
  };

  const startAddEnforcement = () => {
    setEditingEnforcementId(null);
    setEnforcementForm(emptyEnforcementForm);
    setShowEnforcementForm(true);
  };

  const startEditEnforcement = (item: EnforcementItem) => {
    setEditingEnforcementId(item.id);
    setShowEnforcementForm(true);

    setEnforcementForm({
      party_label: item.party_label || "defendant",
      party_other: item.party_other || "",

      judgment_date: item.judgment_date || "",

      command_service_date: item.command_service_date || "",
      service_method: item.service_method || "personal",
      service_result: item.service_result || "pending",

      compliance_days:
        item.compliance_days !== null && item.compliance_days !== undefined
          ? String(item.compliance_days)
          : "30",
      extra_days:
        item.extra_days !== null && item.extra_days !== undefined
          ? String(item.extra_days)
          : "0",
      original_due_date: item.original_due_date || "",
      final_due_date: item.final_due_date || "",

      writ_request_date: item.writ_request_date || "",
      writ_issued_date: item.writ_issued_date || "",

      status: item.status || "not_started",
      note: item.note || "",
    });
  };

  const cancelEnforcementForm = () => {
    setEditingEnforcementId(null);
    setShowEnforcementForm(false);
    setEnforcementForm(emptyEnforcementForm);
  };

  const validateEnforcement = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return false;
    }

    if (!enforcementForm.party_label.trim()) {
      alert("กรุณาเลือกจำเลยหรือผู้ถูกบังคับ");
      return false;
    }

    if (
      enforcementForm.party_label === "other" &&
      !enforcementForm.party_other.trim()
    ) {
      alert("กรุณาระบุผู้ถูกบังคับอื่นๆ");
      return false;
    }

    return true;
  };

  const buildEnforcementPayload = () => {
    return {
      case_id: caseIdNumber,

      party_label: enforcementForm.party_label,
      party_other:
        enforcementForm.party_label === "other"
          ? enforcementForm.party_other
          : "",

      judgment_date: toNullableDate(enforcementForm.judgment_date),

      command_service_date: toNullableDate(
        enforcementForm.command_service_date
      ),
      service_method: enforcementForm.service_method,
      service_result: enforcementForm.service_result,

      compliance_days: toNullableInteger(enforcementForm.compliance_days),
      extra_days: toNullableInteger(enforcementForm.extra_days),
      original_due_date: toNullableDate(enforcementForm.original_due_date),
      final_due_date: toNullableDate(enforcementForm.final_due_date),

      writ_request_date: toNullableDate(enforcementForm.writ_request_date),
      writ_issued_date: toNullableDate(enforcementForm.writ_issued_date),

      status: enforcementForm.status,
      note: enforcementForm.note,

      updated_at: new Date().toISOString(),
    };
  };

  const createEnforcement = async () => {
    if (!validateEnforcement()) return;

    try {
      setSavingEnforcement(true);

      const { error } = await supabase.from("case_enforcements").insert([
        {
          ...buildEnforcementPayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create enforcement failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelEnforcementForm();
      await loadData();
    } finally {
      setSavingEnforcement(false);
    }
  };

  const updateEnforcement = async () => {
    if (!editingEnforcementId) return;
    if (!validateEnforcement()) return;

    try {
      setSavingEnforcement(true);

      const { error } = await supabase
        .from("case_enforcements")
        .update(buildEnforcementPayload())
        .eq("id", editingEnforcementId);

      if (error) {
        alert("Update enforcement failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelEnforcementForm();
      await loadData();
    } finally {
      setSavingEnforcement(false);
    }
  };

  const deleteEnforcement = async (id: string) => {
    const confirmed = window.confirm(
      "ต้องการลบรายการบังคับคดีนี้หรือไม่?\nรายการทรัพย์ที่ผูกกับรายการนี้จะถูกลบด้วย"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("case_enforcements")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Delete enforcement failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingEnforcementId === id) cancelEnforcementForm();

    await loadData();
  };

  const startAddAsset = (enforcementId?: string) => {
    setEditingAssetId(null);
    setAssetForm({
      ...emptyAssetForm,
      enforcement_id: enforcementId || enforcements[0]?.id || "",
    });
    setShowAssetForm(true);
  };

  const startEditAsset = (item: AssetItem) => {
    setEditingAssetId(item.id);
    setShowAssetForm(true);

    setAssetForm({
      enforcement_id: item.enforcement_id || "",

      search_agency: item.search_agency || "land",
      search_office: item.search_office || "",
      search_date: item.search_date || "",
      search_result: item.search_result || "pending",

      asset_type: item.asset_type || "land",
      asset_description: item.asset_description || "",
      asset_identifier: item.asset_identifier || "",
      asset_owner: item.asset_owner || "",
      estimated_value:
        item.estimated_value !== null && item.estimated_value !== undefined
          ? formatMoneyInput(String(item.estimated_value))
          : "",

      client_notified_date: item.client_notified_date || "",
      client_approval_status:
        item.client_approval_status || "not_notified",
      client_approval_date: item.client_approval_date || "",
      client_reason: item.client_reason || "",

      seizure_request_date: item.seizure_request_date || "",
      seizure_date: item.seizure_date || "",
      seizure_status: item.seizure_status || "not_started",

      auction_announcement_date: item.auction_announcement_date || "",
      auction_date: item.auction_date || "",
      auction_round:
        item.auction_round !== null && item.auction_round !== undefined
          ? String(item.auction_round)
          : "",
      auction_status: item.auction_status || "not_started",
      auction_result: item.auction_result || "",
      sale_amount:
        item.sale_amount !== null && item.sale_amount !== undefined
          ? formatMoneyInput(String(item.sale_amount))
          : "",

      note: item.note || "",
    });
  };

  const cancelAssetForm = () => {
    setEditingAssetId(null);
    setShowAssetForm(false);
    setAssetForm(emptyAssetForm);
  };

  const validateAsset = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return false;
    }

    if (!assetForm.enforcement_id) {
      alert("กรุณาเลือก Command & Writ ที่เกี่ยวข้องก่อน");
      return false;
    }

    return true;
  };

  const buildAssetPayload = () => {
    return {
      enforcement_id: assetForm.enforcement_id || null,
      case_id: caseIdNumber,

      search_agency: assetForm.search_agency,
      search_office: assetForm.search_office,
      search_date: toNullableDate(assetForm.search_date),
      search_result: assetForm.search_result,

      asset_type: assetForm.asset_type,
      asset_description: assetForm.asset_description,
      asset_identifier: assetForm.asset_identifier,
      asset_owner: assetForm.asset_owner,
      estimated_value: toNullableMoney(assetForm.estimated_value),

      client_notified_date: toNullableDate(assetForm.client_notified_date),
      client_approval_status: assetForm.client_approval_status,
      client_approval_date: toNullableDate(assetForm.client_approval_date),
      client_reason: assetForm.client_reason,

      seizure_request_date: toNullableDate(assetForm.seizure_request_date),
      seizure_date: toNullableDate(assetForm.seizure_date),
      seizure_status: assetForm.seizure_status,

      auction_announcement_date: toNullableDate(
        assetForm.auction_announcement_date
      ),
      auction_date: toNullableDate(assetForm.auction_date),
      auction_round: toNullableInteger(assetForm.auction_round),
      auction_status: assetForm.auction_status,
      auction_result: assetForm.auction_result,
      sale_amount: toNullableMoney(assetForm.sale_amount),

      note: assetForm.note,

      updated_at: new Date().toISOString(),
    };
  };

  const createAsset = async () => {
    if (!validateAsset()) return;

    try {
      setSavingAsset(true);

      const { error } = await supabase.from("case_enforcement_assets").insert([
        {
          ...buildAssetPayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create asset failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelAssetForm();
      await loadData();
    } finally {
      setSavingAsset(false);
    }
  };

  const updateAsset = async () => {
    if (!editingAssetId) return;
    if (!validateAsset()) return;

    try {
      setSavingAsset(true);

      const { error } = await supabase
        .from("case_enforcement_assets")
        .update(buildAssetPayload())
        .eq("id", editingAssetId);

      if (error) {
        alert("Update asset failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelAssetForm();
      await loadData();
    } finally {
      setSavingAsset(false);
    }
  };

  const deleteAsset = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบรายการทรัพย์นี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("case_enforcement_assets")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Delete asset failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingAssetId === id) cancelAssetForm();

    await loadData();
  };

  const assetsByEnforcement = useMemo(() => {
    const map = new Map<string, AssetItem[]>();

    assets.forEach((asset) => {
      const key = asset.enforcement_id || "";
      const list = map.get(key) || [];
      list.push(asset);
      map.set(key, list);
    });

    return map;
  }, [assets]);

  return (
    <div id="enforcement" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Enforcement</h3>
          <div style={subTitleStyle}>
            คำบังคับ หมายบังคับคดี สืบทรัพย์ อนุมัติยึด ยึดทรัพย์ และขายทอดตลาด
          </div>
        </div>

        <div style={buttonWrapStyle}>
          {!showEnforcementForm ? (
            <button
              type="button"
              onClick={startAddEnforcement}
              style={primaryButtonStyle}
            >
              + Add Command/Writ
            </button>
          ) : (
            <button
              type="button"
              onClick={cancelEnforcementForm}
              style={secondaryButtonStyle}
            >
              Cancel Command
            </button>
          )}

          {!showAssetForm ? (
            <button
              type="button"
              onClick={() => startAddAsset()}
              style={secondaryButtonStyle}
              disabled={enforcements.length === 0}
              title={
                enforcements.length === 0
                  ? "ต้องมี Command/Writ ก่อนจึงเพิ่มทรัพย์ได้"
                  : ""
              }
            >
              + Add Asset Search
            </button>
          ) : (
            <button
              type="button"
              onClick={cancelAssetForm}
              style={secondaryButtonStyle}
            >
              Cancel Asset
            </button>
          )}
        </div>
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard
          label="Ready for Writ"
          value={String(summary.readyForWrit)}
        />
        <SummaryCard label="Writ Issued" value={String(summary.writIssued)} />
        <SummaryCard label="Assets Found" value={String(summary.assetsFound)} />
        <SummaryCard
          label="Waiting Approval"
          value={String(summary.waitingApproval)}
        />
        <SummaryCard
          label="Auction Soon"
          value={String(summary.auctionSoon)}
        />
      </div>

      {showEnforcementForm && (
        <div style={formCardStyle}>
          <h4 style={formTitleStyle}>
            {editingEnforcementId ? "Edit Command & Writ" : "Add Command & Writ"}
          </h4>

          <div style={formGridStyle}>
            <Select
              label="ผู้ถูกบังคับ / จำเลย"
              value={enforcementForm.party_label}
              onChange={(value) =>
                setEnforcementForm({
                  ...enforcementForm,
                  party_label: value,
                  party_other:
                    value === "other" ? enforcementForm.party_other : "",
                })
              }
              options={partyOptions}
            />

            {enforcementForm.party_label === "other" && (
              <Input
                label="ระบุผู้ถูกบังคับ"
                value={enforcementForm.party_other}
                onChange={(value) =>
                  setEnforcementForm({
                    ...enforcementForm,
                    party_other: value,
                  })
                }
              />
            )}

            <Input
              label="วันที่ศาลมีคำพิพากษา"
              type="date"
              value={enforcementForm.judgment_date}
              onChange={(value) =>
                setEnforcementForm({
                  ...enforcementForm,
                  judgment_date: value,
                })
              }
            />

            <Input
              label="วันที่ส่งคำบังคับได้"
              type="date"
              value={enforcementForm.command_service_date}
              onChange={handleCommandDateChange}
            />

            <Select
              label="ส่งคำบังคับโดยวิธี"
              value={enforcementForm.service_method}
              onChange={handleServiceMethodChange}
              options={serviceMethodOptions}
            />

            <Select
              label="ผลการส่งคำบังคับ"
              value={enforcementForm.service_result}
              onChange={(value) =>
                setEnforcementForm({
                  ...enforcementForm,
                  service_result: value,
                })
              }
              options={serviceResultOptions}
            />

            <Input
              label="จำนวนวันที่ให้ปฏิบัติตามคำพิพากษา"
              value={enforcementForm.compliance_days}
              onChange={handleComplianceDaysChange}
              placeholder="15 หรือ 30"
            />

            <Input
              label="จำนวนวันเพิ่มพิเศษ"
              value={enforcementForm.extra_days}
              onChange={handleExtraDaysChange}
              placeholder="กรณีปิดหมาย ส่วนใหญ่ 15"
            />

            <ReadOnlyBox
              label="วันครบกำหนดเดิม"
              value={formatDisplayDate(enforcementForm.original_due_date)}
            />

            <ReadOnlyBox
              label="วันครบกำหนดจริง"
              value={formatDisplayDate(enforcementForm.final_due_date)}
            />

            <Input
              label="วันที่ยื่นขอออกหมายบังคับคดี"
              type="date"
              value={enforcementForm.writ_request_date}
              onChange={(value) =>
                setEnforcementForm({
                  ...enforcementForm,
                  writ_request_date: value,
                })
              }
            />

            <Input
              label="วันที่ศาลออกหมายบังคับคดี"
              type="date"
              value={enforcementForm.writ_issued_date}
              onChange={(value) =>
                setEnforcementForm({
                  ...enforcementForm,
                  writ_issued_date: value,
                })
              }
            />

            <Select
              label="Status"
              value={enforcementForm.status}
              onChange={(value) =>
                setEnforcementForm({
                  ...enforcementForm,
                  status: value,
                })
              }
              options={enforcementStatusOptions}
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="หมายเหตุ"
                value={enforcementForm.note}
                onChange={(value) =>
                  setEnforcementForm({ ...enforcementForm, note: value })
                }
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={
                editingEnforcementId ? updateEnforcement : createEnforcement
              }
              disabled={savingEnforcement}
              style={primaryButtonStyle}
            >
              {savingEnforcement ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={cancelEnforcementForm}
              disabled={savingEnforcement}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAssetForm && (
        <div style={formCardStyle}>
          <h4 style={formTitleStyle}>
            {editingAssetId
              ? "Edit Asset Search / Seizure / Auction"
              : "Add Asset Search / Seizure / Auction"}
          </h4>

          <div style={formGridStyle}>
            <Select
              label="ผูกกับ Command/Writ"
              value={assetForm.enforcement_id}
              onChange={(value) =>
                setAssetForm({ ...assetForm, enforcement_id: value })
              }
              options={[
                { value: "", label: "เลือก Command/Writ" },
                ...enforcements.map((item) => ({
                  value: item.id,
                  label: `${renderPartyLabel(
                    item.party_label,
                    item.party_other
                  )} / ${renderEnforcementStatus(item.status)}`,
                })),
              ]}
            />

            <Select
              label="หน่วยงานที่สืบ"
              value={assetForm.search_agency}
              onChange={(value) =>
                setAssetForm({ ...assetForm, search_agency: value })
              }
              options={searchAgencyOptions}
            />

            <Input
              label="สำนักงาน / สาขา / จังหวัด"
              value={assetForm.search_office}
              onChange={(value) =>
                setAssetForm({ ...assetForm, search_office: value })
              }
              placeholder="เช่น สำนักงานที่ดินกรุงเทพมหานคร / ขนส่งจตุจักร"
            />

            <Input
              label="วันที่สืบทรัพย์"
              type="date"
              value={assetForm.search_date}
              onChange={(value) =>
                setAssetForm({ ...assetForm, search_date: value })
              }
            />

            <Select
              label="ผลการสืบทรัพย์"
              value={assetForm.search_result}
              onChange={(value) =>
                setAssetForm({ ...assetForm, search_result: value })
              }
              options={searchResultOptions}
            />

            <Select
              label="ประเภททรัพย์"
              value={assetForm.asset_type}
              onChange={(value) =>
                setAssetForm({ ...assetForm, asset_type: value })
              }
              options={assetTypeOptions}
            />

            <Input
              label="เลขทรัพย์ / เลขโฉนด / ทะเบียนรถ"
              value={assetForm.asset_identifier}
              onChange={(value) =>
                setAssetForm({ ...assetForm, asset_identifier: value })
              }
              placeholder="เช่น โฉนดเลขที่... / กข 1234"
            />

            <Input
              label="เจ้าของกรรมสิทธิ์"
              value={assetForm.asset_owner}
              onChange={(value) =>
                setAssetForm({ ...assetForm, asset_owner: value })
              }
            />

            <Input
              label="ราคาประเมิน / มูลค่าโดยประมาณ"
              value={assetForm.estimated_value}
              onChange={(value) =>
                setAssetForm({
                  ...assetForm,
                  estimated_value: formatMoneyInput(value),
                })
              }
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="รายละเอียดทรัพย์"
                value={assetForm.asset_description}
                onChange={(value) =>
                  setAssetForm({
                    ...assetForm,
                    asset_description: value,
                  })
                }
                placeholder="เช่น ที่ดินตั้งอยู่ที่... / รถยนต์ยี่ห้อ... รุ่น..."
              />
            </div>

            <Input
              label="วันที่แจ้งลูกค้า"
              type="date"
              value={assetForm.client_notified_date}
              onChange={(value) =>
                setAssetForm({
                  ...assetForm,
                  client_notified_date: value,
                })
              }
            />

            <Select
              label="ผลการอนุมัติจากลูกค้า"
              value={assetForm.client_approval_status}
              onChange={(value) =>
                setAssetForm({
                  ...assetForm,
                  client_approval_status: value,
                })
              }
              options={clientApprovalOptions}
            />

            <Input
              label="วันที่ลูกค้าตอบ"
              type="date"
              value={assetForm.client_approval_date}
              onChange={(value) =>
                setAssetForm({
                  ...assetForm,
                  client_approval_date: value,
                })
              }
            />

            <Input
              label="วันที่ยื่นคำขอยึด"
              type="date"
              value={assetForm.seizure_request_date}
              onChange={(value) =>
                setAssetForm({
                  ...assetForm,
                  seizure_request_date: value,
                })
              }
            />

            <Input
              label="วันที่ยึดจริง"
              type="date"
              value={assetForm.seizure_date}
              onChange={(value) =>
                setAssetForm({ ...assetForm, seizure_date: value })
              }
            />

            <Select
              label="สถานะการยึด"
              value={assetForm.seizure_status}
              onChange={(value) =>
                setAssetForm({ ...assetForm, seizure_status: value })
              }
              options={seizureStatusOptions}
            />

            <Input
              label="วันที่ประกาศขาย"
              type="date"
              value={assetForm.auction_announcement_date}
              onChange={(value) =>
                setAssetForm({
                  ...assetForm,
                  auction_announcement_date: value,
                })
              }
            />

            <Input
              label="วันขายทอดตลาด"
              type="date"
              value={assetForm.auction_date}
              onChange={(value) =>
                setAssetForm({ ...assetForm, auction_date: value })
              }
            />

            <Input
              label="ขายครั้งที่"
              value={assetForm.auction_round}
              onChange={(value) =>
                setAssetForm({
                  ...assetForm,
                  auction_round: sanitizeNumberString(value),
                })
              }
            />

            <Select
              label="สถานะการขาย"
              value={assetForm.auction_status}
              onChange={(value) =>
                setAssetForm({ ...assetForm, auction_status: value })
              }
              options={auctionStatusOptions}
            />

            <Input
              label="ราคาขายได้"
              value={assetForm.sale_amount}
              onChange={(value) =>
                setAssetForm({
                  ...assetForm,
                  sale_amount: formatMoneyInput(value),
                })
              }
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <Textarea
                label="เหตุผลลูกค้า / ผลการขาย / หมายเหตุ"
                value={assetForm.client_reason || assetForm.note}
                onChange={(value) =>
                  setAssetForm({
                    ...assetForm,
                    note: value,
                    client_reason: value,
                  })
                }
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={editingAssetId ? updateAsset : createAsset}
              disabled={savingAsset}
              style={primaryButtonStyle}
            >
              {savingAsset ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={cancelAssetForm}
              disabled={savingAsset}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={emptyStyle}>Loading enforcement data...</div>
      ) : enforcements.length === 0 ? (
        <div style={emptyStyle}>No enforcement data added.</div>
      ) : (
        <div style={enforcementListStyle}>
          {enforcements.map((item) => {
            const itemAssets = assetsByEnforcement.get(item.id) || [];
            return (
              <EnforcementCard
                key={item.id}
                item={item}
                assets={itemAssets}
                onEdit={startEditEnforcement}
                onDelete={deleteEnforcement}
                onAddAsset={startAddAsset}
                onEditAsset={startEditAsset}
                onDeleteAsset={deleteAsset}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function EnforcementCard({
  item,
  assets,
  onEdit,
  onDelete,
  onAddAsset,
  onEditAsset,
  onDeleteAsset,
}: {
  item: EnforcementItem;
  assets: AssetItem[];
  onEdit: (item: EnforcementItem) => void;
  onDelete: (id: string) => void;
  onAddAsset: (enforcementId?: string) => void;
  onEditAsset: (item: AssetItem) => void;
  onDeleteAsset: (id: string) => void;
}) {
  const status = renderEnforcementStatus(item.status);
  const urgency = getEnforcementUrgency(item);

  return (
    <div style={enforcementCardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>
            {renderPartyLabel(item.party_label, item.party_other)}
          </div>
          <div style={cardSubTitleStyle}>{status}</div>
        </div>

        <span style={getUrgencyBadgeStyle(urgency)}>{urgency}</span>
      </div>

      <div style={metaGridStyle}>
        <InfoLine label="Judgment Date" value={formatDisplayDate(item.judgment_date)} />
        <InfoLine
          label="Command Service Date"
          value={formatDisplayDate(item.command_service_date)}
        />
        <InfoLine label="Service Method" value={renderServiceMethod(item.service_method)} />
        <InfoLine label="Service Result" value={renderServiceResult(item.service_result)} />
        <InfoLine
          label="Compliance Days"
          value={item.compliance_days !== null && item.compliance_days !== undefined ? String(item.compliance_days) : "-"}
        />
        <InfoLine
          label="Extra Days"
          value={item.extra_days !== null && item.extra_days !== undefined ? String(item.extra_days) : "-"}
        />
        <InfoLine
          label="Original Due Date"
          value={formatDisplayDate(item.original_due_date)}
        />
        <InfoLine
          label="Final Due Date"
          value={formatDisplayDate(item.final_due_date)}
        />
        <InfoLine
          label="Writ Request Date"
          value={formatDisplayDate(item.writ_request_date)}
        />
        <InfoLine
          label="Writ Issued Date"
          value={formatDisplayDate(item.writ_issued_date)}
        />
      </div>

      {item.note && <div style={noteBlockStyle}>{item.note}</div>}

      <div style={actionWrapStyle}>
        <button type="button" onClick={() => onEdit(item)} style={smallButtonStyle}>
          Edit Command
        </button>
        <button
          type="button"
          onClick={() => onAddAsset(item.id)}
          style={smallButtonStyle}
        >
          + Add Asset
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          style={dangerButtonStyle}
        >
          Delete
        </button>
      </div>

      <div style={assetSectionStyle}>
        <div style={assetHeaderStyle}>Asset Search / Seizure / Auction</div>

        {assets.length === 0 ? (
          <div style={smallEmptyStyle}>No asset search records.</div>
        ) : (
          <div style={assetListStyle}>
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                item={asset}
                onEdit={onEditAsset}
                onDelete={onDeleteAsset}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({
  item,
  onEdit,
  onDelete,
}: {
  item: AssetItem;
  onEdit: (item: AssetItem) => void;
  onDelete: (id: string) => void;
}) {
  const title =
    renderAssetType(item.asset_type) +
    (item.asset_identifier ? ` / ${item.asset_identifier}` : "");

  return (
    <div style={assetCardStyle}>
      <div style={assetCardHeaderStyle}>
        <div>
          <div style={assetTitleStyle}>{title}</div>
          <div style={assetSubTitleStyle}>
            {renderSearchAgency(item.search_agency)} •{" "}
            {renderSearchResult(item.search_result)}
          </div>
        </div>

        <span style={assetBadgeStyle}>
          {renderClientApproval(item.client_approval_status)}
        </span>
      </div>

      <div style={metaGridStyle}>
        <InfoLine label="Search Office" value={item.search_office || "-"} />
        <InfoLine label="Search Date" value={formatDisplayDate(item.search_date)} />
        <InfoLine label="Asset Owner" value={item.asset_owner || "-"} />
        <InfoLine
          label="Estimated Value"
          value={formatMoneyDisplay(item.estimated_value)}
        />
        <InfoLine
          label="Client Notified"
          value={formatDisplayDate(item.client_notified_date)}
        />
        <InfoLine
          label="Client Approval Date"
          value={formatDisplayDate(item.client_approval_date)}
        />
        <InfoLine
          label="Seizure Request"
          value={formatDisplayDate(item.seizure_request_date)}
        />
        <InfoLine label="Seizure Date" value={formatDisplayDate(item.seizure_date)} />
        <InfoLine label="Seizure Status" value={renderSeizureStatus(item.seizure_status)} />
        <InfoLine
          label="Auction Announcement"
          value={formatDisplayDate(item.auction_announcement_date)}
        />
        <InfoLine label="Auction Date" value={formatDisplayDate(item.auction_date)} />
        <InfoLine
          label="Auction Round"
          value={
            item.auction_round !== null && item.auction_round !== undefined
              ? String(item.auction_round)
              : "-"
          }
        />
        <InfoLine label="Auction Status" value={renderAuctionStatus(item.auction_status)} />
        <InfoLine label="Sale Amount" value={formatMoneyDisplay(item.sale_amount)} />
      </div>

      {item.asset_description && (
        <div style={noteBlockStyle}>{item.asset_description}</div>
      )}

      {(item.client_reason || item.note) && (
        <div style={noteBlockStyle}>{item.client_reason || item.note}</div>
      )}

      <div style={actionWrapStyle}>
        <button type="button" onClick={() => onEdit(item)} style={smallButtonStyle}>
          Edit Asset
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          style={dangerButtonStyle}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function ReadOnlyBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={readonlyBoxStyle}>{value || "-"}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={textareaStyle}
      />
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function computeDueDates(
  commandServiceDate: string,
  complianceDaysText: string,
  extraDaysText: string
) {
  if (!commandServiceDate) {
    return {
      originalDueDate: "",
      finalDueDate: "",
    };
  }

  const complianceDays = Number(complianceDaysText || 0);
  const extraDays = Number(extraDaysText || 0);

  if (Number.isNaN(complianceDays) || complianceDays <= 0) {
    return {
      originalDueDate: "",
      finalDueDate: "",
    };
  }

  const original = addDays(commandServiceDate, complianceDays);
  const final = addDays(original, extraDays);

  return {
    originalDueDate: original,
    finalDueDate: final,
  };
}

function addDays(dateText: string, days: number) {
  const date = parseLocalDate(dateText);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function diffDaysFromToday(dateText: string) {
  const today = parseLocalDate(getTodayDateString());
  const target = parseLocalDate(dateText);

  return Math.floor(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function parseLocalDate(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getEnforcementUrgency(item: EnforcementItem) {
  if (item.status === "closed" || item.status === "sold") return "Done";

  if (!item.final_due_date) return "Normal";

  const diff = diffDaysFromToday(item.final_due_date);

  if (diff < 0 && !item.writ_issued_date) return "Ready";
  if (diff === 0) return "Today";
  if (diff > 0 && diff <= 3) return "Soon";

  return "Normal";
}

function getUrgencyBadgeStyle(urgency: string): CSSProperties {
  if (urgency === "Ready") {
    return {
      ...badgeBaseStyle,
      background: "#ffe5e5",
      color: "#b42318",
      border: "1px solid #f1b5b5",
    };
  }

  if (urgency === "Today") {
    return {
      ...badgeBaseStyle,
      background: "#fff3cd",
      color: "#b54708",
      border: "1px solid #f0d58a",
    };
  }

  if (urgency === "Soon") {
    return {
      ...badgeBaseStyle,
      background: "#fff8e1",
      color: "#b54708",
      border: "1px solid #eedc9a",
    };
  }

  if (urgency === "Done") {
    return {
      ...badgeBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  return {
    ...badgeBaseStyle,
    background: "#f8fafc",
    color: "#475467",
    border: "1px solid #dde3ea",
  };
}

function renderFromOptions(
  value: string | null | undefined,
  options: { value: string; label: string }[]
) {
  if (!value) return "-";
  return options.find((item) => item.value === value)?.label || value;
}

function renderPartyLabel(value?: string | null, other?: string | null) {
  if (value === "other") return other || "อื่นๆ";
  return renderFromOptions(value, partyOptions);
}

function renderServiceMethod(value?: string | null) {
  return renderFromOptions(value, serviceMethodOptions);
}

function renderServiceResult(value?: string | null) {
  return renderFromOptions(value, serviceResultOptions);
}

function renderEnforcementStatus(value?: string | null) {
  return renderFromOptions(value, enforcementStatusOptions);
}

function renderSearchAgency(value?: string | null) {
  return renderFromOptions(value, searchAgencyOptions);
}

function renderSearchResult(value?: string | null) {
  return renderFromOptions(value, searchResultOptions);
}

function renderAssetType(value?: string | null) {
  return renderFromOptions(value, assetTypeOptions);
}

function renderClientApproval(value?: string | null) {
  return renderFromOptions(value, clientApprovalOptions);
}

function renderSeizureStatus(value?: string | null) {
  return renderFromOptions(value, seizureStatusOptions);
}

function renderAuctionStatus(value?: string | null) {
  return renderFromOptions(value, auctionStatusOptions);
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function sanitizeNumberString(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatMoneyInput(value: string) {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  const [integerPart, decimalPart] = cleaned.split(".");
  const formattedInteger = Number(integerPart || 0).toLocaleString("en-US");

  if (decimalPart !== undefined) {
    return `${formattedInteger}.${decimalPart.slice(0, 2)}`;
  }

  return formattedInteger;
}

function toNullableMoney(value: string) {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;

  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;

  return num;
}

function formatMoneyDisplay(value?: number | null) {
  if (value === null || value === undefined) return "-";

  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toNullableDate(value: string) {
  return value && value.trim() ? value : null;
}

function toNullableInteger(value: string) {
  if (!value || !value.trim()) return null;

  const num = Number(value);
  if (Number.isNaN(num)) return null;

  return num;
}

/* =========================================================
   STYLES
========================================================= */

const sectionStyle: CSSProperties = {
  border: "1px solid #dddddd",
  padding: 16,
  borderRadius: 12,
  background: "#ffffff",
  color: "#111111",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 16,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
};

const subTitleStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
};

const buttonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 14,
  background: "#fafafa",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 6,
  fontWeight: 700,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#111111",
};

const formCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 16,
  background: "#fafafa",
  marginBottom: 18,
};

const formTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  color: "#111111",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#222222",
  fontWeight: 600,
  fontSize: 13,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  background: "#ffffff",
  color: "#111111",
  colorScheme: "light",
  boxSizing: "border-box",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 90,
  resize: "vertical",
};

const readonlyBoxStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#eeeeee",
  color: "#111111",
  boxSizing: "border-box",
  fontWeight: 800,
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  background: "#000000",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  background: "#ffffff",
  color: "#111111",
  borderRadius: 8,
  border: "1px solid #cccccc",
  cursor: "pointer",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const emptyStyle: CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
};

const smallEmptyStyle: CSSProperties = {
  padding: 12,
  border: "1px dashed #cccccc",
  borderRadius: 10,
  color: "#666666",
  background: "#ffffff",
  fontSize: 13,
};

const enforcementListStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const enforcementCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const cardTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: "#111111",
  lineHeight: 1.45,
};

const cardSubTitleStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
  fontWeight: 700,
};

const metaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginBottom: 10,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 2,
  fontWeight: 700,
};

const infoValueStyle: CSSProperties = {
  fontSize: 14,
  color: "#111111",
  fontWeight: 700,
  wordBreak: "break-word",
  lineHeight: 1.5,
};

const noteBlockStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
  color: "#111111",
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  marginTop: 8,
};

const actionWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
  flexWrap: "wrap",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 600,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 700,
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const assetSectionStyle: CSSProperties = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid #eeeeee",
};

const assetHeaderStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  marginBottom: 10,
  color: "#111111",
};

const assetListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const assetCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};

const assetCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 10,
};

const assetTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#111111",
};

const assetSubTitleStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#555555",
  fontWeight: 700,
};

const assetBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#475467",
  border: "1px solid #d0d5dd",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};