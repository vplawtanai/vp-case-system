"use client";
import { useParams } from "next/navigation";
import { CombinedWorkspace } from "../../workspace";
export default function CombinedPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <CombinedWorkspace id={id} previewOnly />;
}
