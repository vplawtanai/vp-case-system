"use client";
import DetailModal, { type DetailModalProps } from "../../components/DetailModal";
import { FinanceIcon, type FinanceIconName } from "./icons";
import css from "./finance-ui.module.css";

type Props = Omit<DetailModalProps, "icon"> & { icon?: FinanceIconName };
// All lifecycle callbacks, acknowledgements, focus and close semantics stay with
// the existing dialog/caller. This wrapper supplies only Finance presentation.
export default function FinanceModal({ variant = "detail", icon, size, className, ...props }: Props) {
  const glyph = icon || (variant === "payment" ? "payout" : variant === "destructive" ? "alert" : variant);
  return <DetailModal {...props} variant={variant} size={variant === "destructive" ? "confirm" : size}
    className={`${css.scope} ${css.modal} ${className || ""}`}
    icon={<span className={css.modalIcon}><FinanceIcon name={glyph} size={22}/></span>}/>;
}
