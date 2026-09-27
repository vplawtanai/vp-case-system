"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { PASSWORD_MIN_LENGTH, passwordText } from "../../../lib/password-onboarding";

export default function TemporaryPasswordFields({ password, confirmation, onPassword, onConfirmation, required = true }: {
  password: string; confirmation: string; onPassword: (value: string) => void;
  onConfirmation: (value: string) => void; required?: boolean;
}) {
  const { locale } = useI18n();
  return <>
    <label>{passwordText("temporary", locale)}<input type="password" required={required} minLength={required ? PASSWORD_MIN_LENGTH : undefined} autoComplete="new-password" value={password} onChange={e => onPassword(e.target.value)} /></label>
    <label>{passwordText("confirmation", locale)}<input type="password" required={required} minLength={required ? PASSWORD_MIN_LENGTH : undefined} autoComplete="new-password" value={confirmation} onChange={e => onConfirmation(e.target.value)} /></label>
    <p>{passwordText("hint", locale)}</p>
  </>;
}
