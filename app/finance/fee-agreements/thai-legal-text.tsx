"use client";

import { Fragment, useSyncExternalStore } from "react";
import { thaiLegalTextUnits } from "./thai-legal-typography";

const subscribeToClient = () => () => {};

export function ThaiLegalText({ text, languageCode = "th" }: { text: string; languageCode?: string }) {
  const canSegment = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const units = canSegment ? thaiLegalTextUnits(text, languageCode) : [{ text, isWhitespace: false }];

  return <>{units.map((unit, index) => {
    if (unit.isWhitespace) return <Fragment key={index}>{unit.text}</Fragment>;
    const next = units[index + 1];
    return <Fragment key={index}>
      <span className="thai-legal-phrase">{unit.text}</span>
      {next && !next.isWhitespace ? <wbr /> : null}
    </Fragment>;
  })}</>;
}
