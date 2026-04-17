"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

type Props = {
  caseId: string;
  noteText?: string;
};

export default function NotesSection({ caseId, noteText }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [text, setText] = useState(noteText || "");
  const [currentText, setCurrentText] = useState(noteText || "");

  useEffect(() => {
    setText(noteText || "");
    setCurrentText(noteText || "");
  }, [noteText]);

  const saveNote = async () => {
    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", caseId), {
        noteText: text,
        updatedAt: serverTimestamp(),
      });

      setCurrentText(text);
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      alert("Save note failed.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setText(currentText);
    setIsEditing(false);
  };

  return (
    <div id="notes" style={cardStyle}>
      <div style={responsiveHeaderStyle}>
        <h3 style={{ margin: 0 }}>Notes</h3>

        {!isEditing ? (
          <div style={mobileButtonWrapStyle}>
            <button onClick={() => setIsEditing(true)} style={buttonSecondary}>
              Edit
            </button>
          </div>
        ) : (
          <div style={mobileButtonWrapStyle}>
            <button
              onClick={saveNote}
              disabled={saving}
              style={buttonPrimary}
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              onClick={cancelEdit}
              disabled={saving}
              style={buttonSecondary}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {!isEditing ? (
        <div style={noteDisplayStyle}>
          {currentText ? currentText : "No notes yet."}
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={textareaStyle}
          placeholder="บันทึกแนวทางคดี / strategy / สิ่งที่ต้องทำ..."
        />
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
  overflow: "hidden",
};

const responsiveHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const mobileButtonWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const noteDisplayStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.7,
  minHeight: 60,
  wordBreak: "break-word",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 140,
  padding: 10,
  borderRadius: 6,
  border: "1px solid #ccc",
  resize: "vertical",
  lineHeight: 1.6,
  boxSizing: "border-box",
};

const buttonPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  background: "black",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const buttonSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  background: "white",
  border: "1px solid #ccc",
  cursor: "pointer",
};