"use client";

import { Fragment, useSyncExternalStore } from "react";
import { thaiLegalTextUnits } from "./thai-legal-typography";

const subscribeToClient = () => () => {};

export function ThaiLegalText({ text, languageCode = "th" }: { text: string; languageCode?: string }) {
  const canSegment = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const units = canSegment ? thaiLegalTextUnits(text, languageCode) : [{ text, isWhitespace: false, protectFromBreak: false, breakAfter: false }];

  return <>{units.map((unit, index) => {
    if (unit.isWhitespace) return <Fragment key={index}>{unit.text}</Fragment>;
    return <Fragment key={index}>
      {unit.protectFromBreak ? <span className="thai-legal-token">{unit.text}</span> : unit.text}
      {unit.breakAfter ? <wbr /> : null}
    </Fragment>;
  })}</>;
}
