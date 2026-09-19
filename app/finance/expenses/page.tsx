import { ExpenseWorkspace } from "./workspace";
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ tax?: string }> }) {
 const params = await searchParams;
 return <ExpenseWorkspace initialTaxFilter={params.tax === "pending"} />;
}
