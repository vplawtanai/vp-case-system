"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";

type PartyRole = "plaintiff" | "defendant" | "petitioner" | "objector";
type PartyEntityType = "individual" | "company";

type PartyItem = {
  id: string;
  role?: PartyRole;
  entityType?: PartyEntityType;
  title?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  orderNo?: number;

  idNumber?: string;
  phone?: string;

  addressNo?: string;
  moo?: string;
  villageName?: string;
  building?: string;
  floor?: string;
  room?: string;
  soi?: string;
  road?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
};

type Props = {
  caseId: string;
  parties: PartyItem[];
};

export default function PartiesSection({ caseId, parties }: Props) {
  const emptyForm = {
    role: "plaintiff" as PartyRole,
    entityType: "individual" as PartyEntityType,
    title: "นาย",
    firstName: "",
    lastName: "",
    companyName: "",

    idNumber: "",
    phone: "",

    addressNo: "",
    moo: "",
    villageName: "",
    building: "",
    floor: "",
    room: "",
    soi: "",
    road: "",
    subdistrict: "",
    district: "",
    province: "",
    postalCode: "",
  };

  const [localParties, setLocalParties] = useState<PartyItem[]>(parties);
  const [showForm, setShowForm] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [partyForm, setPartyForm] = useState(emptyForm);

  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalParties(parties);
  }, [parties]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 820);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const refreshParties = async () => {
    const snap = await getDocs(collection(db, "cases", caseId, "parties"));
    const data = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as PartyItem[];

    setLocalParties(data);
  };

  const scrollToForm = () => {
    setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const sortedParties = useMemo(() => {
    return [...localParties].sort(
      (a, b) => (a.orderNo || 0) - (b.orderNo || 0)
    );
  }, [localParties]);

  const groupedParties = useMemo(() => {
    return {
      plaintiff: sortedParties.filter((p) => p.role === "plaintiff"),
      defendant: sortedParties.filter((p) => p.role === "defendant"),
      petitioner: sortedParties.filter((p) => p.role === "petitioner"),
      objector: sortedParties.filter((p) => p.role === "objector"),
    };
  }, [sortedParties]);

  const roleOrder: PartyRole[] = [
    "plaintiff",
    "defendant",
    "petitioner",
    "objector",
  ];

  const renderPartyName = (party: PartyItem) => {
    if (party.entityType === "individual") {
      return `${party.title || ""}${party.firstName || ""} ${party.lastName || ""}`.trim();
    }
    return `${party.title || ""} ${party.companyName || ""}`.trim();
  };

  const roleLabel = (role?: string) => {
    if (role === "plaintiff") return "PLAINTIFF";
    if (role === "defendant") return "DEFENDANT";
    if (role === "petitioner") return "PETITIONER";
    if (role === "objector") return "OBJECTOR";
    return "-";
  };

  const thaiRoleLabel = (role?: string) => {
    if (role === "plaintiff") return "โจทก์";
    if (role === "defendant") return "จำเลย";
    if (role === "petitioner") return "ผู้ร้อง";
    if (role === "objector") return "ผู้คัดค้าน";
    return "-";
  };

  const entityTypeLabel = (entityType?: string) => {
    if (entityType === "individual") return "Individual";
    if (entityType === "company") return "Company";
    return "-";
  };

  const renderAddress = (party: PartyItem) => {
    const parts = [
      party.addressNo ? `บ้านเลขที่ ${party.addressNo}` : "",
      party.moo ? `หมู่ ${party.moo}` : "",
      party.villageName ? `หมู่บ้าน ${party.villageName}` : "",
      party.building ? `อาคาร ${party.building}` : "",
      party.floor ? `ชั้น ${party.floor}` : "",
      party.room ? `ห้อง ${party.room}` : "",
      party.soi ? `ซอย${party.soi}` : "",
      party.road ? `ถนน${party.road}` : "",
      party.subdistrict ? `ตำบล/แขวง${party.subdistrict}` : "",
      party.district ? `อำเภอ/เขต${party.district}` : "",
      party.province ? `จังหวัด${party.province}` : "",
      party.postalCode || "",
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(" ") : "-";
  };

  const resetForm = () => {
    setPartyForm(emptyForm);
    setEditingPartyId(null);
    setShowForm(false);
  };

  const createParty = async () => {
    if (
      partyForm.entityType === "individual" &&
      (!partyForm.firstName || !partyForm.lastName)
    ) {
      alert("Please fill First Name and Last Name.");
      return;
    }

    if (partyForm.entityType === "company" && !partyForm.companyName) {
      alert("Please fill Company Name.");
      return;
    }

    try {
      setSaving(true);

      const snap = await getDocs(collection(db, "cases", caseId, "parties"));
      const maxOrderNo =
        snap.docs.length === 0
          ? 0
          : Math.max(
              ...snap.docs.map(
                (d) => Number((d.data() as { orderNo?: number }).orderNo) || 0
              )
            );

      await addDoc(collection(db, "cases", caseId, "parties"), {
        ...partyForm,
        orderNo: maxOrderNo + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await refreshParties();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Create party failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEditParty = (party: PartyItem) => {
    setEditingPartyId(party.id);
    setShowForm(true);
    setPartyForm({
      role: party.role || "plaintiff",
      entityType: party.entityType || "individual",
      title: party.title || "นาย",
      firstName: party.firstName || "",
      lastName: party.lastName || "",
      companyName: party.companyName || "",

      idNumber: party.idNumber || "",
      phone: party.phone || "",

      addressNo: party.addressNo || "",
      moo: party.moo || "",
      villageName: party.villageName || "",
      building: party.building || "",
      floor: party.floor || "",
      room: party.room || "",
      soi: party.soi || "",
      road: party.road || "",
      subdistrict: party.subdistrict || "",
      district: party.district || "",
      province: party.province || "",
      postalCode: party.postalCode || "",
    });

    scrollToForm();
  };

  const savePartyChanges = async () => {
    if (!editingPartyId) return;

    if (
      partyForm.entityType === "individual" &&
      (!partyForm.firstName || !partyForm.lastName)
    ) {
      alert("Please fill First Name and Last Name.");
      return;
    }

    if (partyForm.entityType === "company" && !partyForm.companyName) {
      alert("Please fill Company Name.");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", caseId, "parties", editingPartyId), {
        ...partyForm,
        updatedAt: serverTimestamp(),
      });

      await refreshParties();
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Save party failed.");
    } finally {
      setSaving(false);
    }
  };

  const removeParty = async (partyId: string) => {
    const confirmed = window.confirm("Delete this party?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", caseId, "parties", partyId));
      await refreshParties();

      if (editingPartyId === partyId) {
        resetForm();
      }
    } catch (error) {
      console.error(error);
      alert("Delete party failed.");
    }
  };

  return (
    <div id="parties" style={cardStyle}>
      <div style={responsiveHeaderStyle}>
        <h3 style={{ margin: 0 }}>Parties</h3>

        <div style={mobileStackButtonWrapStyle}>
          {!showForm ? (
            <button
              type="button"
              onClick={() => {
                setEditingPartyId(null);
                setPartyForm(emptyForm);
                setShowForm(true);
                scrollToForm();
              }}
              style={buttonPrimary}
            >
              + Add Party
            </button>
          ) : (
            <button type="button" onClick={resetForm} style={buttonSecondary}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div ref={formRef}>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>
            {editingPartyId ? "Edit Party" : "Add Party"}
          </div>

          <div style={gridStyle}>
            <div>
              <label>Role</label>
              <select
                value={partyForm.role}
                onChange={(e) =>
                  setPartyForm({
                    ...partyForm,
                    role: e.target.value as PartyRole,
                  })
                }
                style={inputStyle}
              >
                <option value="plaintiff">Plaintiff</option>
                <option value="defendant">Defendant</option>
                <option value="petitioner">Petitioner</option>
                <option value="objector">Objector</option>
              </select>
            </div>

            <div>
              <label>Type</label>
              <select
                value={partyForm.entityType}
                onChange={(e) => {
                  const nextType = e.target.value as PartyEntityType;
                  setPartyForm({
                    ...partyForm,
                    entityType: nextType,
                    title: nextType === "individual" ? "นาย" : "บริษัท",
                    firstName: "",
                    lastName: "",
                    companyName: "",
                    idNumber: "",
                  });
                }}
                style={inputStyle}
              >
                <option value="individual">Individual</option>
                <option value="company">Company</option>
              </select>
            </div>

            {partyForm.entityType === "individual" ? (
              <>
                <div>
                  <label>Title</label>
                  <select
                    value={partyForm.title}
                    onChange={(e) =>
                      setPartyForm({ ...partyForm, title: e.target.value })
                    }
                    style={inputStyle}
                  >
                    <option value="นาย">นาย</option>
                    <option value="นาง">นาง</option>
                    <option value="นางสาว">นางสาว</option>
                  </select>
                </div>

                <div>
                  <label>First Name</label>
                  <input
                    value={partyForm.firstName}
                    onChange={(e) =>
                      setPartyForm({
                        ...partyForm,
                        firstName: e.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label>Last Name</label>
                  <input
                    value={partyForm.lastName}
                    onChange={(e) =>
                      setPartyForm({
                        ...partyForm,
                        lastName: e.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label>เลขบัตรประชาชน</label>
                  <input
                    value={partyForm.idNumber}
                    onChange={(e) =>
                      setPartyForm({
                        ...partyForm,
                        idNumber: e.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label>Title</label>
                  <select
                    value={partyForm.title}
                    onChange={(e) =>
                      setPartyForm({ ...partyForm, title: e.target.value })
                    }
                    style={inputStyle}
                  >
                    <option value="บริษัท">บริษัท</option>
                    <option value="ห้างหุ้นส่วนจำกัด">ห้างหุ้นส่วนจำกัด</option>
                  </select>
                </div>

                <div>
                  <label>เลขทะเบียนนิติบุคคล</label>
                  <input
                    value={partyForm.idNumber}
                    onChange={(e) =>
                      setPartyForm({
                        ...partyForm,
                        idNumber: e.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label>Company Name</label>
                  <input
                    value={partyForm.companyName}
                    onChange={(e) =>
                      setPartyForm({
                        ...partyForm,
                        companyName: e.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            <div>
              <label>เบอร์โทร</label>
              <input
                value={partyForm.phone}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, phone: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>บ้านเลขที่</label>
              <input
                value={partyForm.addressNo}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, addressNo: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>หมู่</label>
              <input
                value={partyForm.moo}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, moo: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>หมู่บ้าน</label>
              <input
                value={partyForm.villageName}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, villageName: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>อาคาร</label>
              <input
                value={partyForm.building}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, building: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>ชั้น</label>
              <input
                value={partyForm.floor}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, floor: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>ห้อง</label>
              <input
                value={partyForm.room}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, room: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>ซอย</label>
              <input
                value={partyForm.soi}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, soi: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>ถนน</label>
              <input
                value={partyForm.road}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, road: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>ตำบล/แขวง</label>
              <input
                value={partyForm.subdistrict}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, subdistrict: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>อำเภอ/เขต</label>
              <input
                value={partyForm.district}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, district: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>จังหวัด</label>
              <input
                value={partyForm.province}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, province: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>รหัสไปรษณีย์</label>
              <input
                value={partyForm.postalCode}
                onChange={(e) =>
                  setPartyForm({ ...partyForm, postalCode: e.target.value })
                }
                style={inputStyle}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={editingPartyId ? savePartyChanges : createParty}
            disabled={saving}
            style={{ ...buttonPrimary, marginTop: 16, marginBottom: 20 }}
          >
            {saving
              ? "Saving..."
              : editingPartyId
                ? "Save Party Changes"
                : "Save New Party"}
          </button>
        </div>
      )}

      {localParties.length === 0 ? (
        <p style={{ marginTop: 12 }}>No parties yet.</p>
      ) : (
        <div style={partyGroupsWrapStyle}>
          {roleOrder.map((role) => {
            const list = groupedParties[role];
            if (list.length === 0) return null;

            return (
              <div key={role} style={groupCardStyle}>
                <div style={groupHeaderStyle}>
                  <div style={groupTitleStyle}>{roleLabel(role)}</div>
                  <div style={groupSubTitleStyle}>
                    {thaiRoleLabel(role)} • {list.length} ราย
                  </div>
                </div>

                {!isMobile ? (
                  <div style={tableScrollWrapStyle}>
                    <table style={responsiveTableStyle}>
                      <thead>
                        <tr style={{ textAlign: "left", background: "#f5f5f5" }}>
                          <th style={cellHead}>#</th>
                          <th style={cellHead}>Name</th>
                          <th style={cellHead}>Type</th>
                          <th style={cellHead}>ID / Registration</th>
                          <th style={cellHead}>Phone</th>
                          <th style={cellHead}>Address</th>
                          <th style={cellHead}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((party, index) => (
                          <tr key={party.id} style={{ borderTop: "1px solid #eee" }}>
                            <td style={cellBody}>{index + 1}</td>
                            <td style={cellBody}>{renderPartyName(party)}</td>
                            <td style={cellBody}>
                              <span style={typePillStyle}>
                                {entityTypeLabel(party.entityType)}
                              </span>
                            </td>
                            <td style={cellBody}>{party.idNumber || "-"}</td>
                            <td style={cellBody}>{party.phone || "-"}</td>
                            <td style={cellBody}>{renderAddress(party)}</td>
                            <td style={cellBody}>
                              <div style={rowActionsWrapStyle}>
                                <button
                                  type="button"
                                  onClick={() => startEditParty(party)}
                                  style={smallButtonStyle}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeParty(party.id)}
                                  style={smallDangerStyle}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={mobileCardListStyle}>
                    {list.map((party, index) => (
                      <PartyCard
                        key={party.id}
                        index={index}
                        name={renderPartyName(party)}
                        roleText={thaiRoleLabel(role)}
                        typeText={entityTypeLabel(party.entityType)}
                        idNumber={party.idNumber || "-"}
                        phone={party.phone || "-"}
                        addressText={renderAddress(party)}
                        onEdit={() => startEditParty(party)}
                        onDelete={() => removeParty(party.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PartyCard({
  index,
  name,
  roleText,
  typeText,
  idNumber,
  phone,
  addressText,
  onEdit,
  onDelete,
}: {
  index: number;
  name: string;
  roleText: string;
  typeText: string;
  idNumber: string;
  phone: string;
  addressText: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={partyCardStyle}>
      <div style={partyCardHeaderStyle}>
        <div>
          <div style={partyTitleStyle}>
            {index + 1}. {name || "-"}
          </div>
          <div style={metaLabelStyle}>{roleText}</div>
        </div>

        <span style={typePillStyle}>{typeText}</span>
      </div>

      <div style={infoBlockStyle}>
        <div style={metaLabelStyle}>เลขบัตร / เลขทะเบียน</div>
        <div style={metaValueStyle}>{idNumber}</div>
      </div>

      <div style={infoBlockStyle}>
        <div style={metaLabelStyle}>Phone</div>
        <div style={metaValueStyle}>{phone}</div>
      </div>

      <div style={addressWrapStyle}>
        <div style={metaLabelStyle}>Address</div>
        <div style={metaValueStyle}>{addressText}</div>
      </div>

      <div style={rowActionsWrapStyle}>
        <button type="button" onClick={onEdit} style={smallButtonStyle}>
          Edit
        </button>
        <button type="button" onClick={onDelete} style={smallDangerStyle}>
          Delete
        </button>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
  overflow: "hidden",
};

const responsiveHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 8,
};

const mobileStackButtonWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const partyGroupsWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  marginTop: 8,
};

const groupCardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const groupHeaderStyle: React.CSSProperties = {
  marginBottom: 12,
};

const groupTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 0.5,
};

const groupSubTitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginTop: 2,
};

const tableScrollWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

const responsiveTableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 1100,
  borderCollapse: "collapse",
};

const mobileCardListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const partyCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const partyCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const partyTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const infoBlockStyle: React.CSSProperties = {
  marginBottom: 10,
};

const addressWrapStyle: React.CSSProperties = {
  marginBottom: 12,
  paddingTop: 8,
  borderTop: "1px solid #f0f0f0",
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#111",
  fontWeight: 500,
  wordBreak: "break-word",
  lineHeight: 1.5,
};

const rowActionsWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const typePillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background: "#f5f5f5",
  color: "#333",
  border: "1px solid #ddd",
};

const buttonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "black",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const buttonSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const smallDangerStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "white",
  color: "darkred",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const cellHead: React.CSSProperties = {
  padding: 12,
};

const cellBody: React.CSSProperties = {
  padding: 12,
  verticalAlign: "top",
};