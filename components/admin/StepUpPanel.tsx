// Tier: build. Use-when: an admin page whose actions need a STEP_UP capability (inventory.adjust,
// staff.manage). Avoid-when: the capability needs no step-up; do not use it as the only check.
// Shows when the confirmation lasts, or the code form. The server action re-checks.
// Reduced-motion: static. Touch: 44 px fields and buttons (ActionForm).
import { getTranslations } from "next-intl/server";
import { ActionForm, type FormMessages } from "@/components/forms/ActionForm";
import { stepUpAction } from "@/lib/actions/identity";
import { formatTime } from "@/lib/format/datetime";
import { STEP_UP_WINDOW_MS } from "@/lib/modules/identity/capabilities";
import type { Principal } from "@/lib/modules/identity/principal";

export async function StepUpPanel({ principal, steppedUp, locale, messages }: { principal: Principal; steppedUp: boolean; locale: "bn" | "en"; messages: FormMessages }) {
  const t = await getTranslations({ locale, namespace: "admin.stepUp" });
  const until = principal.session.stepUpAt ? new Date(principal.session.stepUpAt.getTime() + STEP_UP_WINDOW_MS) : null;
  return (
    <section className="admin-section" aria-labelledby="step-up-title">
      <h2 id="step-up-title" className="admin-section-title">
        {t("title")}
      </h2>
      {steppedUp && until ? (
        <p role="status">{t("active", { time: formatTime(until, locale) })}</p>
      ) : principal.user.twoFactorEnabled ? (
        <>
          <p>{t("body")}</p>
          <ActionForm
            action={stepUpAction}
            testId="step-up-form"
            messages={messages}
            submitLabel={t("submit")}
            pendingLabel={t("pending")}
            fields={[{ name: "code", label: t("code"), type: "otp", autoComplete: "one-time-code", inputMode: "numeric", required: true }]}
          />
        </>
      ) : (
        <p className="admin-notice">{t("needsTwoFactor")}</p>
      )}
    </section>
  );
}
