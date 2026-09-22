"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useI18n } from "../../../lib/i18n/provider";
import { filterClaimCategories, type ClaimCategory } from "./claim-categories";
import css from "./claim-category-combobox.module.css";

export function ClaimCategoryCombobox({ id = "claim-category", value, options, disabled, onChange, "aria-describedby": describedBy }: { id?: string; value: string; options: ClaimCategory[]; disabled: boolean; onChange: (value: string) => void; "aria-describedby"?: string }) {
 const { t, locale } = useI18n();
 const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(value);
 const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
 const selected = options.find(c => c.value === value), filtered = filterClaimCategories(options, query);
 const activeIndex = filtered.findIndex(c => c.value === active), listId = `${id}-options`;
 useEffect(() => { input.current?.setCustomValidity(value ? "" : t("expenses.claimCategorySelectRequired")); }, [value, t]);
 useEffect(() => { if (open && activeIndex >= 0) list.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" }); }, [open, activeIndex]);
 const show = () => { if (disabled) return; setQuery("");setActive(value || options[0]?.value || "");setOpen(true); };
 const choose = (next: string) => { input.current?.focus();onChange(next);setQuery("");setOpen(false); };
 return <div className={css.root} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false);setQuery(""); } }}>
  <div className={css.field}><input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} aria-describedby={describedBy} aria-required="true" autoComplete="off" disabled={disabled} placeholder={t("expenses.claimCategorySearch")} value={open ? query : selected?.label[locale] || ""}
   onFocus={show} onClick={() => { if (!open) show(); }} onChange={e => { const next=e.target.value;setQuery(next);setOpen(true);setActive(filterClaimCategories(options,next)[0]?.value || ""); }}
   onKeyDown={e => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault();if (!open) { show();return; } const delta=e.key === "ArrowDown"?1:-1;setActive(filtered[(activeIndex+delta+filtered.length)%filtered.length]?.value || ""); }
    else if (e.key === "Enter" && open) { e.preventDefault();if (activeIndex>=0) choose(filtered[activeIndex].value); }
    else if (e.key === "Escape" && open) { e.preventDefault();e.stopPropagation();setOpen(false);setQuery(""); }
    else if (e.key === "Tab") { setOpen(false);setQuery(""); }
   }} /><ChevronDown size={18} aria-hidden="true" /></div>
  {open ? <div ref={list} id={listId} role="listbox" aria-label={t("expenses.category")} className={css.list}>
   {filtered.map((option,index) => <div key={option.value} role="presentation">
    {(index === 0 || filtered[index-1].group[locale] !== option.group[locale]) && option.value !== "Other" ? <div className={css.group} role="presentation">{option.group[locale]}</div> : null}
    <button id={`${id}-option-${index}`} type="button" role="option" aria-selected={value === option.value} tabIndex={-1} data-index={index} data-active={active === option.value} className={css.option} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(option.value)}><span>{option.label[locale]}</span>{value === option.value ? <Check size={16} aria-hidden="true"/> : null}</button>
   </div>)}
  </div> : null}
 </div>;
}
