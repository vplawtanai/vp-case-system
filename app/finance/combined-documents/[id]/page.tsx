"use client";
import { useParams } from "next/navigation";
import { CombinedWorkspace } from "../workspace";
export default function CombinedPage() {
  const { id } = useParams<{ id: string }>();
  return <CombinedWorkspace id={id} />;
}
