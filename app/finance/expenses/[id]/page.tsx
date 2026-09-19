import { ExpenseWorkspace } from "../workspace";
export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 return <ExpenseWorkspace id={id} />;
}
