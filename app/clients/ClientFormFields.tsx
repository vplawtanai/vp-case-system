"use client";
import { useI18n } from "../../lib/i18n/provider";
import styles from "./client-form.module.css";

export type ClientFormValues = {
  id: string;
  client_type: string;
  name: string;
  tax_id: string;
  contact_name: string;
  phone: string;
  email: string;
  line_id: string;
  address: string;
  status: string;
  note: string;
};

export const emptyForm: ClientFormValues = {
  id: "",
  client_type: "limited_company",
  name: "",
  tax_id: "",
  contact_name: "",
  phone: "",
  email: "",
  line_id: "",
  address: "",
  status: "active",
  note: "",
};

export const clientTypeOptions = [
  { value: "limited_company", label: "Limited Company" },
  { value: "partnership", label: "Partnership" },
  { value: "limited_partnership", label: "Limited Partnership" },
  { value: "individual", label: "Individual" },
  { value: "group_of_persons", label: "Group of Persons" },
  { value: "government_agency", label: "Government Agency" },
  { value: "association", label: "Association / Foundation" },
  { value: "foreign_company", label: "Foreign Company" },
  { value: "joint_venture", label: "Joint Venture" },
  { value: "consortium", label: "Consortium" },
  { value: "other", label: "Other" },
];

export const statusOptions = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "prospect", label: "Prospect" },
  { value: "blacklist", label: "Blacklist" },
  { value: "deleted", label: "Deleted" },
];

export const editableStatusOptions = statusOptions.filter(
  (option) => option.value !== "deleted"
);


const fields = [
  ["client_type", "Client type"], ["name", "Name"], ["tax_id", "Tax ID"],
  ["contact_name", "Contact name"], ["phone", "Phone"], ["email", "Email"],
  ["line_id", "Line ID"], ["status", "Status"], ["address", "Address"], ["note", "Note"],
] as const;

export default function ClientFormFields({ value, onChange, localized = false, disabled = false }: {
  value: ClientFormValues; onChange: (value: ClientFormValues) => void; localized?: boolean; disabled?: boolean;
}) {
  const { t } = useI18n();
  return <div className={styles.grid}>{fields.map(([key, label]) => {
    const options = key === "client_type" ? clientTypeOptions : key === "status" ? editableStatusOptions : null;
    return <label key={key}>{localized ? t("client.edit.field." + key) : label}
      {options ? <select aria-label={localized ? t("client.edit.field." + key) : label} disabled={disabled} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })}>
        {options.map(option => <option key={option.value} value={option.value}>{localized ? t("client.edit.option." + option.value) : option.label}</option>)}
      </select> : <input disabled={disabled} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })} />}
    </label>;
  })}</div>;
}
