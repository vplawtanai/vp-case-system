"use client";
import { QuotationGuard } from "../quotations/shared";
import { canOverview } from "./data";
import { ExecutiveOverview } from "./workspace";
export default function OverviewPage(){return <QuotationGuard canAccess={a=>canOverview(a.permissions)}>{a=><ExecutiveOverview permissions={a.permissions}/>}</QuotationGuard>;}
