import { ExpenseWorkspace } from "../../workspace";
export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 return <ExpenseWorkspace claims id={id} />;
}
