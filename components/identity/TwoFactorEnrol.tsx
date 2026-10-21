"use client";
// Tier: build. Use-when: turning on two-step verification (/account/security, /admin/security).
// Avoid-when: the sign-in code step (login page). Reduced-motion: no motion. Touch: 44 px controls.
// Step 1 confirms the password and returns a TOTP setup key and ten backup codes (shown once).
// Step 2 confirms a code from the app; only then is 2FA on (Better Auth skipVerificationOnEnable=false).
// No QR image: the key is shown in groups of four for manual entry, plus an otpauth:// link that
// opens the authenticator app on a phone (a QR library would be a new dependency; see PROGRESS B3).
import { ActionForm, type FormMessages } from "@/components/forms/ActionForm";
import { confirmTwoFactorAction, enableTwoFactorAction } from "@/lib/actions/identity";

export interface TwoFactorStrings {
  enablePassword: string;
  enableSubmit: string;
  enablePending: string;
  secretLabel: string;
  secretHint: string;
  openApp: string;
  backupTitle: string;
  backupBody: string;
  confirmCode: string;
  confirmSubmit: string;
  confirmPending: string;
}

export function TwoFactorEnrol({ strings, messages }: { strings: TwoFactorStrings; messages: FormMessages }) {
  return (
    <ActionForm
      action={enableTwoFactorAction}
      fields={[{ name: "password", label: strings.enablePassword, type: "password", autoComplete: "current-password", required: true }]}
      submitLabel={strings.enableSubmit}
      pendingLabel={strings.enablePending}
      messages={messages}
      hideOnSuccess
      testId="two-factor-enable"
      renderSuccess={(state) => {
        const data = state.data as { totpURI: string; secret: string; backupCodes: string[] };
        const grouped = data.secret.replace(/(.{4})/g, "$1 ").trim();
        return (
          <div className="two-factor-setup">
            <div className="two-factor-key">
              <p className="field-label">{strings.secretLabel}</p>
              <p className="field-hint">{strings.secretHint}</p>
              <p className="two-factor-secret" lang="en" data-testid="two-factor-secret" data-secret={data.secret}>
                <code>{grouped}</code>
              </p>
              <p>
                <a className="prose-link" href={data.totpURI}>
                  {strings.openApp}
                </a>
              </p>
            </div>
            <div className="two-factor-backup">
              <p className="field-label">{strings.backupTitle}</p>
              <p className="field-hint">{strings.backupBody}</p>
              <ol className="backup-codes" lang="en">
                {data.backupCodes.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ol>
            </div>
            <ActionForm
              action={confirmTwoFactorAction}
              fields={[{ name: "code", label: strings.confirmCode, type: "otp", autoComplete: "one-time-code", required: true }]}
              submitLabel={strings.confirmSubmit}
              pendingLabel={strings.confirmPending}
              messages={messages}
              hideOnSuccess
              testId="two-factor-confirm"
            />
          </div>
        );
      }}
    />
  );
}
