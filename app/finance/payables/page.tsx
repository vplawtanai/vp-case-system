import { redirect } from "next/navigation";

// Payments are initiated from their source workflows; keep old bookmarks safe.
export default function PayablesPage() {
  redirect("/finance/overview");
}
