"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

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

export default function FeesSection({ caseId }: Props) {
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

  const loadFees = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data: feesData, error: feesError } = await supabase
        .from("case_fee_items")
        .select("*")
        .eq("case_id", caseIdNumber)
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

  const getNextInstallmentNo = () => {
    const maxNo = feeItems.reduce((max, item) => {
      const no = item.installment_no || 0;
      return no > max ? no : max;
    }, 0);

    return maxNo + 1;
  };

  const startAddFee = () => {
    setEditingFeeId(null);
    setFeeForm({
      ...emptyFeeForm,
      installment_no: String(getNextInstallmentNo()),
    });
    setShowFeeForm(true);
  };

  const startEditFee = (item: FeeItem) => {
    setEditingFeeId(item.id);
    setShowFeeForm(true);

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
    if (!validateFee()) return;

    try {
      setSavingFee(true);

      const { error } = await supabase.from("case_fee_items").insert([
        {
          ...buildFeePayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create fee item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelFeeForm();
      await loadFees();
    } finally {
      setSavingFee(false);
    }
  };

  const updateFee = async () => {
    if (!editingFeeId) return;
    if (!validateFee()) return;

    try {
      setSavingFee(true);

      const { error } = await supabase
        .from("case_fee_items")
        .update(buildFeePayload())
        .eq("id", editingFeeId);

      if (error) {
        alert("Update fee item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelFeeForm();
      await loadFees();
    } finally {
      setSavingFee(false);
    }
  };

  const deleteFee = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบรายการค่าวิชาชีพนี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase.from("case_fee_items").delete().eq("id", id);

    if (error) {
      alert("Delete fee item failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingFeeId === id) cancelFeeForm();

    await loadFees();
  };

  const startAddExpense = () => {
    setEditingExpenseId(null);
    setExpenseForm({
      ...emptyExpenseForm,
      expense_date: getTodayDateString(),
    });
    setShowExpenseForm(true);
  };

  const startEditExpense = (item: ExpenseItem) => {
    setEditingExpenseId(item.id);
    setShowExpenseForm(true);

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
    if (!validateExpense()) return;

    try {
      setSavingExpense(true);

      const { error } = await supabase.from("case_expense_items").insert([
        {
          ...buildExpensePayload(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        alert("Create expense item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelExpenseForm();
      await loadFees();
    } finally {
      setSavingExpense(false);
    }
  };

  const updateExpense = async () => {
    if (!editingExpenseId) return;
    if (!validateExpense()) return;

    try {
      setSavingExpense(true);

      const { error } = await supabase
        .from("case_expense_items")
        .update(buildExpensePayload())
        .eq("id", editingExpenseId);

      if (error) {
        alert("Update expense item failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      cancelExpenseForm();
      await loadFees();
    } finally {
      setSavingExpense(false);
    }
  };

  const deleteExpense = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบรายการค่าใช้จ่ายนี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("case_expense_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Delete expense item failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    if (editingExpenseId === id) cancelExpenseForm();

    await loadFees();
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
          label="Total Outstanding"
          value={formatCurrency(summary.totalOutstanding)}
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
              <button type="button" onClick={startAddFee} style={primaryButtonStyle}>
                + Add Fee
              </button>
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
            <div style={formCardStyle}>
              <h4 style={formTitleStyle}>
                {editingFeeId ? "Edit Fee" : "Add Fee"}
              </h4>

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
          ) : feeItems.length === 0 ? (
            <div style={emptyStyle}>No professional fees added.</div>
          ) : (
            <div style={itemListStyle}>
              {feeItems.map((item) => (
                <FeeCard
                  key={item.id}
                  item={item}
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
              <button
                type="button"
                onClick={startAddExpense}
                style={primaryButtonStyle}
              >
                + Add Expense
              </button>
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
            <div style={formCardStyle}>
              <h4 style={formTitleStyle}>
                {editingExpenseId ? "Edit Expense" : "Add Expense"}
              </h4>

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
          ) : expenseItems.length === 0 ? (
            <div style={emptyStyle}>No expenses added.</div>
          ) : (
            <div style={itemListStyle}>
              {expenseItems.map((item) => (
                <ExpenseCard
                  key={item.id}
                  item={item}
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function FeeCard({
  item,
  onEdit,
  onDelete,
}: {
  item: FeeItem;
  onEdit: (item: FeeItem) => void;
  onDelete: (id: string) => void;
}) {
  const amount = toNumber(item.amount);
  const paid = toNumber(item.paid_amount);
  const outstanding = amount - paid;

  return (
    <div style={itemCardStyle}>
      <div style={itemHeaderStyle}>
        <div>
          <div style={itemTitleStyle}>
            งวดที่ {item.installment_no || "-"} : {item.fee_type || "-"}
          </div>
          <div style={itemMetaStyle}>
            Due: {formatDisplayDate(item.due_date)} • Status:{" "}
            {item.status || "-"}
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

      <div style={actionWrapStyle}>
        <button type="button" onClick={() => onEdit(item)} style={smallButtonStyle}>
          Edit
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

function ExpenseCard({
  item,
  onEdit,
  onDelete,
}: {
  item: ExpenseItem;
  onEdit: (item: ExpenseItem) => void;
  onDelete: (id: string) => void;
}) {
  const amount = toNumber(item.amount);
  const reimbursed = toNumber(item.reimbursed_amount);
  const outstanding = item.reimbursable === false ? 0 : amount - reimbursed;

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

      <div style={actionWrapStyle}>
        <button type="button" onClick={() => onEdit(item)} style={smallButtonStyle}>
          Edit
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

  const cleaned = String(value).replace(/,/g, "");
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

function getStatusBadgeStyle(status?: string | null): CSSProperties {
  if (status === "Paid" || status === "Reimbursed") {
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

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
  fontWeight: 600,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: "#111111",
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const panelStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 14,
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
};

const panelSubtitleStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
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

const formCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 16,
  background: "#ffffff",
  marginBottom: 14,
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
  minHeight: 88,
  resize: "vertical",
};

const checkboxBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 40,
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #dddddd",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 600,
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
  flexWrap: "wrap",
};

const emptyStyle: CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
};

const itemListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};

const itemCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const itemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 10,
};

const itemTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#111111",
  lineHeight: 1.45,
};

const itemMetaStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
  fontWeight: 600,
};

const descriptionStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #eeeeee",
  color: "#111111",
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  marginBottom: 10,
};

const moneyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 2,
};

const infoValueStyle: CSSProperties = {
  fontSize: 14,
  color: "#111111",
  fontWeight: 700,
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
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
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