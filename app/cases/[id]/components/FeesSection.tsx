"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";
import { createAuditLog } from "../../../../lib/auditLog";

type FeeItem = {
  id: string;
  case_id: number;
  fee_type?: string | null;
  installment_no?: number | null;
  description?: string | null;
  amount?: number | string | null;
  paid_amount?: number | string | null;
  due_date?: string | null;
  paid_date?: string | null;
  status?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

type ExpenseItem = {
  id: string;
  case_id: number;
  expense_type?: string | null;
  description?: string | null;
  amount?: number | string | null;
  expense_date?: string | null;
  paid_by?: string | null;
  reimbursable?: boolean | null;
  reimbursed_amount?: number | string | null;
  status?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

type FeeForm = {
  fee_type: string;
  installment_no: string;
  description: string;
  amount: string;
  paid_amount: string;
  due_date: string;
  paid_date: string;
  status: string;
  note: string;
};

type ExpenseForm = {
  expense_type: string;
  description: string;
  amount: string;
  expense_date: string;
  paid_by: string;
  reimbursable: boolean;
  reimbursed_amount: string;
  status: string;
  note: string;
};

type Props = {
  caseId: string;
  fees?: unknown[];
  canEdit?: boolean;
  canDelete?: boolean;
};

const feeTypeOptions = [
  "ค่าวิชาชีพทนาย",
  "ค่าดำเนินคดี",
  "ค่าที่ปรึกษา",
  "ค่าร่างเอกสาร",
  "ค่าตรวจสัญญา",
  "ค่าทำหนังสือบอกกล่าว",
  "ค่าดำเนินการเป็นงวด",
  "อื่นๆ",
];

const feeStatusOptions = [
  "Pending",
  "Partially Paid",
  "Paid",
  "Overdue",
  "Cancelled",
];

const expenseTypeOptions = [
  "Court Fee / ค่าธรรมเนียมศาล",
  "Travel / ค่าเดินทาง",
  "Government Fee / ค่าธรรมเนียมราชการ",
  "Document / ค่าเอกสาร",
  "Courier / ค่าส่งเอกสาร",
  "Accommodation / ค่าที่พัก",
  "Other / อื่นๆ",
];

const paidByOptions = [
  "Office / สำนักงานออกแทน",
  "Client / ลูกค้าจ่ายเอง",
  "Lawyer / ทนายออกก่อน",
  "Other / อื่นๆ",
];

const expenseStatusOptions = [
  "Pending Reimbursement",
  "Partially Reimbursed",
  "Reimbursed",
  "Paid by Client",
  "Not Reimbursable",
  "Cancelled",
];

const emptyFeeForm: FeeForm = {
  fee_type: "ค่าวิชาชีพทนาย",
  installment_no: "1",
  description: "",
  amount: "",
  paid_amount: "",
  due_date: "",
  paid_date: "",
  status: "Pending",
  note: "",
};

const emptyExpenseForm: ExpenseForm = {
  expense_type: "Travel / ค่าเดินทาง",
  description: "",
  amount: "",
  expense_date: getTodayDateString(),
  paid_by: "Office / สำนักงานออกแทน",
  reimbursable: true,
  reimbursed_amount: "",
  status: "Pending Reimbursement",
  note: "",
};

export default function FeesSection({
  caseId,
  canEdit = false,
  canDelete = false,
}: Props) {
  const caseIdNumber = Number(caseId);

  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [showFeeForm, setShowFeeForm] = useState(false);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [savingFee, setSavingFee] = useState(false);
  const [feeForm, setFeeForm] = useState<FeeForm>(emptyFeeForm);

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] =
    useState<ExpenseForm>(emptyExpenseForm);

  const feeFormRef = useRef<HTMLDivElement | null>(null);
  const expenseFormRef = useRef<HTMLDivElement | null>(null);

  const scrollToFeeForm = () => {
    window.setTimeout(() => {
      feeFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const scrollToExpenseForm = () => {
    window.setTimeout(() => {
      expenseFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const loadFees = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data: feesData, error: feesError } = await supabase
        .from("case_fee_items")
        .select("*")
        .eq("case_id", caseIdNumber)
        .is("deleted_at", null)
        .order("installment_no", { ascending: true })
        .order("due_date", { ascending: true });

      if (feesError) {
        alert("Load fee items failed:\n" + JSON.stringify(feesError, null, 2));
        setFeeItems([]);
        return;
      }

      const { data: expensesData, error: expensesError } = await supabase
        .from("case_expense_items")
        .select("*")
        .eq("case_id", caseIdNumber)
        .is("deleted_at", null)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (expensesError) {
        alert(
          "Load expense items failed:\n" +
            JSON.stringify(expensesError, null, 2)
        );
        setExpenseItems([]);
        return;
      }

      setFeeItems((feesData || []) as FeeItem[]);
      setExpenseItems((expensesData || []) as ExpenseItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const summary = useMemo(() => {
    const professionalFeeTotal = feeItems.reduce(
      (sum, item) => sum + toNumber(item.amount),
      0
    );

    const professionalFeePaid = feeItems.reduce(
      (sum, item) => sum + toNumber(item.paid_amount),
      0
    );

    const professionalFeeOutstanding =
      professionalFeeTotal - professionalFeePaid;

    const expenseTotal = expenseItems.reduce(
      (sum, item) => sum + toNumber(item.amount),
      0
    );

    const reimbursableExpenseTotal = expenseItems
      .filter((item) => item.reimbursable !== false)
      .reduce((sum, item) => sum + toNumber(item.amount), 0);

    const expenseReimbursed = expenseItems.reduce(
      (sum, item) => sum + toNumber(item.reimbursed_amount),
      0
    );

    const expenseOutstanding = reimbursableExpenseTotal - expenseReimbursed;

    return {
      professionalFeeTotal,
      professionalFeePaid,
      professionalFeeOutstanding,
      expenseTotal,
      reimbursableExpenseTotal,
      expenseReimbursed,
      expenseOutstanding,
      totalOutstanding: professionalFeeOutstanding + expenseOutstanding,
    };
  }, [feeItems, expenseItems]);

  const sortedFeeItems = useMemo(() => {
    return [...feeItems].sort((a, b) => {
      const statusA = getFeeSortScore(a.status);
      const statusB = getFeeSortScore(b.status);

      if (statusA !== statusB) return statusA - statusB;

      const aDue = a.due_date || "9999-12-31";
      const bDue = b.due_date || "9999-12-31";

      if (aDue !== bDue) return aDue.localeCompare(bDue);

      return (a.installment_no || 0) - (b.installment_no || 0);
    });
  }, [feeItems]);

  const sortedExpenseItems = useMemo(() => {
    return [...expenseItems].sort((a, b) => {
      const statusA = getExpenseSortScore(a.status);
      const statusB = getExpenseSortScore(b.status);

      if (statusA !== statusB) return statusA - statusB;

      const aDate = a.expense_date || "0000-00-00";
      const bDate = b.expense_date || "0000-00-00";

      return bDate.localeCompare(aDate);
    });
  }, [expenseItems]);

  const getNextInstallmentNo = () => {
    const maxNo = feeItems.reduce((max, item) => {
      const no = item.installment_no || 0;
      return no > max ? no : max;
    }, 0);

    return maxNo + 1;
  };

  const startAddFee = () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เพิ่มรายการค่าวิชาชีพ");
      return;
    }

    setEditingFeeId(null);
    setFeeForm({
      ...emptyFeeForm,
      installment_no: String(getNextInstallmentNo()),
    });
    setShowFeeForm(true);
    setShowExpenseForm(false);
    scrollToFeeForm();
  };

  const startEditFee = (item: FeeItem) => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขรายการค่าวิชาชีพ");
      return;
    }

    setEditingFeeId(item.id);
    setShowFeeForm(true);
    setShowExpenseForm(false);
    scrollToFeeForm();

    setFeeForm({
      fee_type: item.fee_type || "ค่าวิชาชีพทนาย",
      installment_no: item.installment_no ? String(item.installment_no) : "1",
      description: item.description || "",
      amount: formatNumberInput(toNumber(item.amount)),
      paid_amount: formatNumberInput(toNumber(item.paid_amount)),
      due_date: item.due_date || "",
      paid_date: item.paid_date || "",
      status: item.status || "Pending",
      note: item.note || "",
    });
  };

  const cancelFeeForm = () => {
    setEditingFeeId(null);
    setShowFeeForm(false);
    setFeeForm(emptyFeeForm);
  };

  const validateFee = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return false;
    }

    if (!feeForm.fee_type.trim()) {
      alert("กรุณาเลือกประเภทค่าวิชาชีพ");
      return false;
    }

    if (toNumber(feeForm.amount) <= 0) {
      alert("กรุณากรอกจำนวนเงินค่าวิชาชีพ");
      return false;
    }

    return true;
  };

  const buildFeePayload = () => {
    const amount = toNumber(feeForm.amount);
    const paidAmount = toNumber(feeForm.paid_amount);

    return {
      case_id: caseIdNumber,
      fee_type: feeForm.fee_type,
      installment_no: feeForm.installment_no
        ? Number(feeForm.installment_no)
        : null,
      description: feeForm.description,
      amount,
      paid_amount: paidAmount,
      due_date: feeForm.due_date || null,
      paid_date: feeForm.paid_date || null,
      status: feeForm.status,
      note: feeForm.note,
      updated_at: new Date().toISOString(),
    };
  };

  const createFee = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เพิ่มรายการค่าวิชาชีพ");
      cancelFeeForm();
      return;
    }

    if (!validateFee()) return;

    try {
      setSavingFee(true);

      const payload = {
        ...buildFeePayload(),
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };

      const { data, error } = await supabase
        .from("case_fee_items")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        alert("Create fee item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_fee_items",
        recordId: data?.id,
        action: "create",
        oldData: null,
        newData: data || payload,
        note: "Create professional fee item",
      });

      cancelFeeForm();
      await loadFees();
    } finally {
      setSavingFee(false);
    }
  };

  const updateFee = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขรายการค่าวิชาชีพ");
      cancelFeeForm();
      return;
    }

    if (!editingFeeId) return;
    if (!validateFee()) return;

    try {
      setSavingFee(true);

      const oldData = feeItems.find((item) => item.id === editingFeeId) || null;
      const payload = buildFeePayload();

      const { data, error } = await supabase
        .from("case_fee_items")
        .update(payload)
        .eq("id", editingFeeId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert("Update fee item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_fee_items",
        recordId: editingFeeId,
        action: "update",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Update professional fee item",
      });

      cancelFeeForm();
      await loadFees();
    } finally {
      setSavingFee(false);
    }
  };

  const deleteFee = async (id: string) => {
    if (!canDelete) {
      alert("คุณไม่มีสิทธิ์ลบรายการค่าวิชาชีพ");
      return;
    }

    const confirmed = window.confirm(
      "ต้องการลบรายการค่าวิชาชีพนี้หรือไม่?\n\nระบบจะซ่อนรายการนี้ออกจากหน้าใช้งาน แต่ยังเก็บข้อมูลไว้ในฐานข้อมูลเพื่อใช้ตรวจสอบย้อนหลัง"
    );

    if (!confirmed) return;

    try {
      setSavingFee(true);

      const oldData = feeItems.find((item) => item.id === id) || null;

      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: "current_user",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("case_fee_items")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert("Soft delete fee item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_fee_items",
        recordId: id,
        action: "soft_delete",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Soft delete professional fee item",
      });

      if (editingFeeId === id) cancelFeeForm();

      await loadFees();
    } finally {
      setSavingFee(false);
    }
  };

  const startAddExpense = () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เพิ่มรายการค่าใช้จ่าย");
      return;
    }

    setEditingExpenseId(null);
    setExpenseForm({
      ...emptyExpenseForm,
      expense_date: getTodayDateString(),
    });
    setShowExpenseForm(true);
    setShowFeeForm(false);
    scrollToExpenseForm();
  };

  const startEditExpense = (item: ExpenseItem) => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขรายการค่าใช้จ่าย");
      return;
    }

    setEditingExpenseId(item.id);
    setShowExpenseForm(true);
    setShowFeeForm(false);
    scrollToExpenseForm();

    setExpenseForm({
      expense_type: item.expense_type || "Travel / ค่าเดินทาง",
      description: item.description || "",
      amount: formatNumberInput(toNumber(item.amount)),
      expense_date: item.expense_date || getTodayDateString(),
      paid_by: item.paid_by || "Office / สำนักงานออกแทน",
      reimbursable: item.reimbursable !== false,
      reimbursed_amount: formatNumberInput(toNumber(item.reimbursed_amount)),
      status: item.status || "Pending Reimbursement",
      note: item.note || "",
    });
  };

  const cancelExpenseForm = () => {
    setEditingExpenseId(null);
    setShowExpenseForm(false);
    setExpenseForm(emptyExpenseForm);
  };

  const validateExpense = () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return false;
    }

    if (!expenseForm.expense_type.trim()) {
      alert("กรุณาเลือกประเภทค่าใช้จ่าย");
      return false;
    }

    if (toNumber(expenseForm.amount) <= 0) {
      alert("กรุณากรอกจำนวนเงินค่าใช้จ่าย");
      return false;
    }

    return true;
  };

  const buildExpensePayload = () => {
    return {
      case_id: caseIdNumber,
      expense_type: expenseForm.expense_type,
      description: expenseForm.description,
      amount: toNumber(expenseForm.amount),
      expense_date: expenseForm.expense_date || null,
      paid_by: expenseForm.paid_by,
      reimbursable: expenseForm.reimbursable,
      reimbursed_amount: toNumber(expenseForm.reimbursed_amount),
      status: expenseForm.status,
      note: expenseForm.note,
      updated_at: new Date().toISOString(),
    };
  };

  const createExpense = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์เพิ่มรายการค่าใช้จ่าย");
      cancelExpenseForm();
      return;
    }

    if (!validateExpense()) return;

    try {
      setSavingExpense(true);

      const payload = {
        ...buildExpensePayload(),
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };

      const { data, error } = await supabase
        .from("case_expense_items")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        alert("Create expense item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_expense_items",
        recordId: data?.id,
        action: "create",
        oldData: null,
        newData: data || payload,
        note: "Create expense item",
      });

      cancelExpenseForm();
      await loadFees();
    } finally {
      setSavingExpense(false);
    }
  };

  const updateExpense = async () => {
    if (!canEdit) {
      alert("คุณไม่มีสิทธิ์แก้ไขรายการค่าใช้จ่าย");
      cancelExpenseForm();
      return;
    }

    if (!editingExpenseId) return;
    if (!validateExpense()) return;

    try {
      setSavingExpense(true);

      const oldData =
        expenseItems.find((item) => item.id === editingExpenseId) || null;
      const payload = buildExpensePayload();

      const { data, error } = await supabase
        .from("case_expense_items")
        .update(payload)
        .eq("id", editingExpenseId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert("Update expense item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_expense_items",
        recordId: editingExpenseId,
        action: "update",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Update expense item",
      });

      cancelExpenseForm();
      await loadFees();
    } finally {
      setSavingExpense(false);
    }
  };

  const deleteExpense = async (id: string) => {
    if (!canDelete) {
      alert("คุณไม่มีสิทธิ์ลบรายการค่าใช้จ่าย");
      return;
    }

    const confirmed = window.confirm(
      "ต้องการลบรายการค่าใช้จ่ายนี้หรือไม่?\n\nระบบจะซ่อนรายการนี้ออกจากหน้าใช้งาน แต่ยังเก็บข้อมูลไว้ในฐานข้อมูลเพื่อใช้ตรวจสอบย้อนหลัง"
    );

    if (!confirmed) return;

    try {
      setSavingExpense(true);

      const oldData = expenseItems.find((item) => item.id === id) || null;

      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: "current_user",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("case_expense_items")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(
          "Soft delete expense item failed:\n" + JSON.stringify(error, null, 2)
        );
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: "case_expense_items",
        recordId: id,
        action: "soft_delete",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Soft delete expense item",
      });

      if (editingExpenseId === id) cancelExpenseForm();

      await loadFees();
    } finally {
      setSavingExpense(false);
    }
  };

  return (
    <div id="fees" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Fees & Expenses</h3>
          <div style={subTitleStyle}>
            ค่าวิชาชีพทนาย งวดชำระ ค่าเดินทาง ค่าธรรมเนียม และค่าใช้จ่ายภายนอก
          </div>
        </div>
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard
          label="Professional Fees"
          value={formatCurrency(summary.professionalFeeTotal)}
        />
        <SummaryCard
          label="Fee Paid"
          value={formatCurrency(summary.professionalFeePaid)}
        />
        <SummaryCard
          label="Fee Outstanding"
          value={formatCurrency(summary.professionalFeeOutstanding)}
          tone={summary.professionalFeeOutstanding > 0 ? "warning" : "normal"}
        />
        <SummaryCard
          label="Expenses"
          value={formatCurrency(summary.expenseTotal)}
        />
        <SummaryCard
          label="Expense Reimbursed"
          value={formatCurrency(summary.expenseReimbursed)}
        />
        <SummaryCard
          label="Expense Outstanding"
          value={formatCurrency(summary.expenseOutstanding)}
          tone={summary.expenseOutstanding > 0 ? "warning" : "normal"}
        />
        <SummaryCard
          label="Total Outstanding"
          value={formatCurrency(summary.totalOutstanding)}
          tone={summary.totalOutstanding > 0 ? "danger" : "normal"}
        />
      </div>

      <div style={twoColumnStyle}>
        <section style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h4 style={panelTitleStyle}>Professional Fees</h4>
              <div style={panelSubtitleStyle}>ค่าบริการ / ค่าวิชาชีพทนาย</div>
            </div>

            {!showFeeForm ? (
              canEdit ? (
                <button
                  type="button"
                  onClick={startAddFee}
                  style={primaryButtonStyle}
                >
                  + Add Fee
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={cancelFeeForm}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            )}
          </div>

          {showFeeForm && (
            <div ref={feeFormRef} style={formCardStyle}>
              <div style={formHeaderStyle}>
                <div>
                  <h4 style={formTitleStyle}>
                    {editingFeeId ? "Edit Fee" : "Add Fee"}
                  </h4>
                  <div style={formSubTitleStyle}>
                    บันทึกค่าวิชาชีพ งวดชำระ ยอดรับชำระ และวันครบกำหนด
                  </div>
                </div>

                {editingFeeId && <span style={editBadgeStyle}>Editing</span>}
              </div>

              <div style={formGridStyle}>
                <Select
                  label="Fee Type"
                  value={feeForm.fee_type}
                  onChange={(value) =>
                    setFeeForm({ ...feeForm, fee_type: value })
                  }
                  options={feeTypeOptions.map((option) => ({
                    value: option,
                    label: option,
                  }))}
                />

                <Input
                  label="Installment No."
                  type="number"
                  value={feeForm.installment_no}
                  onChange={(value) =>
                    setFeeForm({
                      ...feeForm,
                      installment_no: onlyDigits(value),
                    })
                  }
                />

                <Input
                  label="Amount"
                  value={feeForm.amount}
                  onChange={(value) =>
                    setFeeForm({
                      ...feeForm,
                      amount: formatAmountInput(value),
                    })
                  }
                  placeholder="50,000.00"
                />

                <Input
                  label="Paid Amount"
                  value={feeForm.paid_amount}
                  onChange={(value) =>
                    setFeeForm({
                      ...feeForm,
                      paid_amount: formatAmountInput(value),
                    })
                  }
                  placeholder="0.00"
                />

                <Input
                  label="Due Date"
                  type="date"
                  value={feeForm.due_date}
                  onChange={(value) =>
                    setFeeForm({ ...feeForm, due_date: value })
                  }
                />

                <Input
                  label="Paid Date"
                  type="date"
                  value={feeForm.paid_date}
                  onChange={(value) =>
                    setFeeForm({ ...feeForm, paid_date: value })
                  }
                />

                <Select
                  label="Status"
                  value={feeForm.status}
                  onChange={(value) =>
                    setFeeForm({ ...feeForm, status: value })
                  }
                  options={feeStatusOptions.map((option) => ({
                    value: option,
                    label: option,
                  }))}
                />

                <div style={{ gridColumn: "1 / -1" }}>
                  <Textarea
                    label="Description"
                    value={feeForm.description}
                    onChange={(value) =>
                      setFeeForm({ ...feeForm, description: value })
                    }
                    placeholder="เช่น ค่าวิชาชีพงวดที่ 1 เมื่อรับดำเนินคดี"
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Textarea
                    label="Note"
                    value={feeForm.note}
                    onChange={(value) =>
                      setFeeForm({ ...feeForm, note: value })
                    }
                  />
                </div>
              </div>

              <div style={formButtonWrapStyle}>
                <button
                  type="button"
                  onClick={editingFeeId ? updateFee : createFee}
                  disabled={savingFee}
                  style={primaryButtonStyle}
                >
                  {savingFee ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={cancelFeeForm}
                  disabled={savingFee}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={emptyStyle}>Loading fees...</div>
          ) : sortedFeeItems.length === 0 ? (
            <div style={emptyStyle}>No professional fees added.</div>
          ) : (
            <div style={itemListStyle}>
              {sortedFeeItems.map((item) => (
                <FeeCard
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={startEditFee}
                  onDelete={deleteFee}
                />
              ))}
            </div>
          )}
        </section>

        <section style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h4 style={panelTitleStyle}>Expenses</h4>
              <div style={panelSubtitleStyle}>
                ค่าเดินทาง ค่าธรรมเนียม และค่าใช้จ่ายภายนอก
              </div>
            </div>

            {!showExpenseForm ? (
              canEdit ? (
                <button
                  type="button"
                  onClick={startAddExpense}
                  style={primaryButtonStyle}
                >
                  + Add Expense
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={cancelExpenseForm}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            )}
          </div>

          {showExpenseForm && (
            <div ref={expenseFormRef} style={formCardStyle}>
              <div style={formHeaderStyle}>
                <div>
                  <h4 style={formTitleStyle}>
                    {editingExpenseId ? "Edit Expense" : "Add Expense"}
                  </h4>
                  <div style={formSubTitleStyle}>
                    บันทึกค่าใช้จ่าย การออกเงินแทน และยอดเรียกคืนจากลูกค้า
                  </div>
                </div>

                {editingExpenseId && (
                  <span style={editBadgeStyle}>Editing</span>
                )}
              </div>

              <div style={formGridStyle}>
                <Select
                  label="Expense Type"
                  value={expenseForm.expense_type}
                  onChange={(value) =>
                    setExpenseForm({ ...expenseForm, expense_type: value })
                  }
                  options={expenseTypeOptions.map((option) => ({
                    value: option,
                    label: option,
                  }))}
                />

                <Input
                  label="Amount"
                  value={expenseForm.amount}
                  onChange={(value) =>
                    setExpenseForm({
                      ...expenseForm,
                      amount: formatAmountInput(value),
                    })
                  }
                  placeholder="1,000.00"
                />

                <Input
                  label="Expense Date"
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(value) =>
                    setExpenseForm({ ...expenseForm, expense_date: value })
                  }
                />

                <Select
                  label="Paid By"
                  value={expenseForm.paid_by}
                  onChange={(value) =>
                    setExpenseForm({ ...expenseForm, paid_by: value })
                  }
                  options={paidByOptions.map((option) => ({
                    value: option,
                    label: option,
                  }))}
                />

                <Select
                  label="Status"
                  value={expenseForm.status}
                  onChange={(value) =>
                    setExpenseForm({ ...expenseForm, status: value })
                  }
                  options={expenseStatusOptions.map((option) => ({
                    value: option,
                    label: option,
                  }))}
                />

                <Input
                  label="Reimbursed Amount"
                  value={expenseForm.reimbursed_amount}
                  onChange={(value) =>
                    setExpenseForm({
                      ...expenseForm,
                      reimbursed_amount: formatAmountInput(value),
                    })
                  }
                  placeholder="0.00"
                />

                <div style={checkboxBoxStyle}>
                  <input
                    type="checkbox"
                    checked={expenseForm.reimbursable}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        reimbursable: e.target.checked,
                        status: e.target.checked
                          ? expenseForm.status
                          : "Not Reimbursable",
                      })
                    }
                  />
                  <span>Reimbursable / เรียกคืนจากลูกค้า</span>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Textarea
                    label="Description"
                    value={expenseForm.description}
                    onChange={(value) =>
                      setExpenseForm({ ...expenseForm, description: value })
                    }
                    placeholder="เช่น ค่าเดินทางไปศาล / ค่าธรรมเนียมศาล / ค่าส่งเอกสาร"
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Textarea
                    label="Note"
                    value={expenseForm.note}
                    onChange={(value) =>
                      setExpenseForm({ ...expenseForm, note: value })
                    }
                  />
                </div>
              </div>

              <div style={formButtonWrapStyle}>
                <button
                  type="button"
                  onClick={editingExpenseId ? updateExpense : createExpense}
                  disabled={savingExpense}
                  style={primaryButtonStyle}
                >
                  {savingExpense ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={cancelExpenseForm}
                  disabled={savingExpense}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={emptyStyle}>Loading expenses...</div>
          ) : sortedExpenseItems.length === 0 ? (
            <div style={emptyStyle}>No expenses added.</div>
          ) : (
            <div style={itemListStyle}>
              {sortedExpenseItems.map((item) => (
                <ExpenseCard
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={startEditExpense}
                  onDelete={deleteExpense}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function SummaryCard({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "warning" | "danger";
}) {
  return (
    <div
      style={{
        ...summaryCardStyle,
        ...(tone === "warning" ? summaryWarningStyle : {}),
        ...(tone === "danger" ? summaryDangerStyle : {}),
      }}
    >
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function FeeCard({
  item,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  item: FeeItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (item: FeeItem) => void;
  onDelete: (id: string) => void;
}) {
  const amount = toNumber(item.amount);
  const paid = toNumber(item.paid_amount);
  const outstanding = amount - paid;
  const showActions = canEdit || canDelete;

  return (
    <div style={itemCardStyle}>
      <div style={itemHeaderStyle}>
        <div>
          <div style={itemTitleStyle}>
            งวดที่ {item.installment_no || "-"} : {item.fee_type || "-"}
          </div>
          <div style={itemMetaStyle}>
            Due: {formatDisplayDate(item.due_date)} • Paid:{" "}
            {formatCurrency(paid)}
          </div>
        </div>

        <span style={getStatusBadgeStyle(item.status)}>{item.status || "-"}</span>
      </div>

      {item.description && (
        <div style={descriptionStyle}>{item.description}</div>
      )}

      <div style={moneyGridStyle}>
        <InfoLine label="Amount" value={formatCurrency(amount)} />
        <InfoLine label="Paid" value={formatCurrency(paid)} />
        <InfoLine label="Outstanding" value={formatCurrency(outstanding)} />
        <InfoLine label="Paid Date" value={formatDisplayDate(item.paid_date)} />
      </div>

      {item.note && <div style={noteBlockStyle}>{item.note}</div>}

      {showActions && (
        <div style={actionWrapStyle}>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              style={smallButtonStyle}
            >
              Edit
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              style={dangerButtonStyle}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ExpenseCard({
  item,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  item: ExpenseItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (item: ExpenseItem) => void;
  onDelete: (id: string) => void;
}) {
  const amount = toNumber(item.amount);
  const reimbursed = toNumber(item.reimbursed_amount);
  const outstanding = item.reimbursable === false ? 0 : amount - reimbursed;
  const showActions = canEdit || canDelete;

  return (
    <div style={itemCardStyle}>
      <div style={itemHeaderStyle}>
        <div>
          <div style={itemTitleStyle}>{item.expense_type || "-"}</div>
          <div style={itemMetaStyle}>
            Date: {formatDisplayDate(item.expense_date)} • Paid By:{" "}
            {item.paid_by || "-"}
          </div>
        </div>

        <span style={getStatusBadgeStyle(item.status)}>{item.status || "-"}</span>
      </div>

      {item.description && (
        <div style={descriptionStyle}>{item.description}</div>
      )}

      <div style={moneyGridStyle}>
        <InfoLine label="Amount" value={formatCurrency(amount)} />
        <InfoLine label="Reimbursed" value={formatCurrency(reimbursed)} />
        <InfoLine label="Outstanding" value={formatCurrency(outstanding)} />
        <InfoLine
          label="Reimbursable"
          value={item.reimbursable === false ? "No" : "Yes"}
        />
      </div>

      {item.note && <div style={noteBlockStyle}>{item.note}</div>}

      {showActions && (
        <div style={actionWrapStyle}>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              style={smallButtonStyle}
            >
              Edit
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              style={dangerButtonStyle}
            >
              Delete
            </button>
          )}
        </div>
      )}
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

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function onlyDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatAmountInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");

  if (parts.length <= 1) {
    return addCommas(parts[0] || "");
  }

  return `${addCommas(parts[0] || "")}.${parts[1].slice(0, 2)}`;
}

function formatNumberInput(value: number) {
  if (!value) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function addCommas(value: string) {
  if (!value) return "";
  return Number(value).toLocaleString("en-US");
}

function toNumber(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return 0;

  const cleaned = String(value).trim().replace(/,/g, "");
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return `${safeValue.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} บาท`;
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function getFeeSortScore(status?: string | null) {
  if (status === "Overdue") return 1;
  if (status === "Pending") return 2;
  if (status === "Partially Paid") return 3;
  if (status === "Paid") return 4;
  if (status === "Cancelled") return 5;
  return 9;
}

function getExpenseSortScore(status?: string | null) {
  if (status === "Pending Reimbursement") return 1;
  if (status === "Partially Reimbursed") return 2;
  if (status === "Reimbursed") return 3;
  if (status === "Paid by Client") return 4;
  if (status === "Not Reimbursable") return 5;
  if (status === "Cancelled") return 6;
  return 9;
}

function getStatusBadgeStyle(status?: string | null): CSSProperties {
  if (status === "Paid" || status === "Reimbursed" || status === "Paid by Client") {
    return {
      ...badgeBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  if (
    status === "Overdue" ||
    status === "Pending Reimbursement" ||
    status === "Partially Paid" ||
    status === "Partially Reimbursed"
  ) {
    return {
      ...badgeBaseStyle,
      background: "#fff8e1",
      color: "#b54708",
      border: "1px solid #eedc9a",
    };
  }

  if (status === "Cancelled" || status === "Not Reimbursable") {
    return {
      ...badgeBaseStyle,
      background: "#f1f5f9",
      color: "#475467",
      border: "1px solid #d0d5dd",
    };
  }

  return {
    ...badgeBaseStyle,
    background: "#f8fafc",
    color: "#475467",
    border: "1px solid #dde3ea",
  };
}

/* =========================================================
   STYLES
========================================================= */

const sectionStyle: CSSProperties = {
  border: "1px solid #dddddd",
  padding: "clamp(12px, 2vw, 16px)",
  borderRadius: 14,
  background: "#ffffff",
  color: "#111111",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
  fontSize: 18,
  fontWeight: 900,
};

const subTitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#666666",
  fontSize: 13,
  lineHeight: 1.45,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 11,
  background: "#fafafa",
};

const summaryWarningStyle: CSSProperties = {
  background: "#fffaf0",
  border: "1px solid #eedc9a",
};

const summaryDangerStyle: CSSProperties = {
  background: "#fff5f5",
  border: "1px solid #f1b5b5",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 4,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const summaryValueStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: "#111111",
  lineHeight: 1.35,
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const panelStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 14,
  padding: 12,
  background: "#fafafa",
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 12,
  flexWrap: "wrap",
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
  fontSize: 16,
  fontWeight: 900,
};

const panelSubtitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#666666",
  fontSize: 12,
  lineHeight: 1.45,
};

const primaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#000000",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#ffffff",
  color: "#111111",
  borderRadius: 8,
  border: "1px solid #cccccc",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const formCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 14,
  padding: 14,
  background: "#ffffff",
  marginBottom: 14,
  scrollMarginTop: 105,
};

const formHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 12,
  flexWrap: "wrap",
};

const formTitleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
  fontSize: 16,
  fontWeight: 900,
};

const formSubTitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#666666",
  fontSize: 12,
  lineHeight: 1.45,
};

const editBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#fff8e1",
  color: "#b54708",
  border: "1px solid #eedc9a",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 3,
  color: "#777777",
  fontWeight: 800,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  background: "#ffffff",
  color: "#111111",
  colorScheme: "light",
  boxSizing: "border-box",
  fontSize: 13,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 78,
  resize: "vertical",
};

const checkboxBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 36,
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 700,
  fontSize: 13,
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  flexWrap: "wrap",
};

const emptyStyle: CSSProperties = {
  padding: 14,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
};

const itemListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
};

const itemCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 12,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
};

const itemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 9,
};

const itemTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#111111",
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const itemMetaStyle: CSSProperties = {
  marginTop: 3,
  color: "#555555",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.45,
};

const descriptionStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
  color: "#111111",
  fontSize: 13,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  marginBottom: 10,
  wordBreak: "break-word",
};

const moneyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 9,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 2,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#111111",
  fontWeight: 800,
  wordBreak: "break-word",
  lineHeight: 1.5,
};

const noteBlockStyle: CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
  color: "#111111",
  fontSize: 13,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const actionWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
  flexWrap: "wrap",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: "nowrap",
};
