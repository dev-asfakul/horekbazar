// Tier: build (B9 part 2b). Use-when: /admin/products/[id] with GEMINI_API_KEY set. Avoid-when: no key
// (render nothing; domain-rules §7 "with no key, no AI control renders"). Reduced-motion: no motion.
// AI drafts for one product (BUILD-PLAN §8 `AiDraftDiff`): the free-tier notice, a request form,
// and each open draft beside the live text, field by field. "Apply" writes that one field with the
// product version on screen; nothing else changes, and the product's status never does.
import { getTranslations } from "next-intl/server";
import type { Db } from "mongodb";
import { ActionForm, type FormMessages } from "@/components/forms/ActionForm";
import { applyAiFieldAction, createAiDraftAction, discardAiDraftAction } from "@/lib/actions/ai-drafts";
import type { AiConfig } from "@/lib/adapters/ai/gemini";
import { liveValue, openProductDrafts } from "@/lib/modules/ai/drafts";
import { AI_FIELD_KEYS, type AiField } from "@/lib/modules/ai/schema";
import type { ProductDoc } from "@/lib/modules/catalogue/schema";

function Text({ value, empty }: { value: { bn: string; en?: string | undefined } | undefined; empty: string }) {
  if (!value) return <p className="record-sub">{empty}</p>;
  return (
    <>
      <p className="ai-text" lang="bn">
        {value.bn}
      </p>
      {value.en ? (
        <p className="ai-text" lang="en">
          {value.en}
        </p>
      ) : null}
    </>
  );
}

export async function AiDraftsPanel({ db, product, config, messages, locale }: { db: Db; product: ProductDoc; config: AiConfig; messages: FormMessages; locale: "bn" | "en" }) {
  const t = await getTranslations({ locale, namespace: "admin.aiDrafts" });
  const open = await openProductDrafts(db, String(product._id));
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  const fieldOptions = AI_FIELD_KEYS.map((f) => ({ value: f, label: t(`fields.${f}`) }));

  return (
    <section className="admin-section" aria-labelledby="ai-title" data-testid="ai-drafts">
      <h2 id="ai-title" className="admin-section-title">
        {t("title")}
      </h2>
      <p className="admin-notice" data-testid="ai-free-tier-notice">
        {t("notice", { model: config.model })}
      </p>
      <ActionForm
        action={createAiDraftAction}
        testId="ai-draft-create"
        hidden={{ productId: String(product._id) }}
        fields={[
          { name: "fields", label: t("chooseFields"), type: "multiselect", options: fieldOptions, defaultValues: ["shortDescription", "description"], required: true },
          { name: "instructions", label: t("instructions"), hint: t("instructionsHint"), type: "textarea", rows: 2, maxLength: 300 },
        ]}
        messages={messages}
        submitLabel={t("create")}
        pendingLabel={t("creating")}
      />
      {open.length === 0 ? (
        <p className="record-sub" data-testid="ai-drafts-empty">
          {t("none")}
        </p>
      ) : (
        <ul className="staff-rows">
          {open.map((d) => {
            const stale = d.targetVersion !== product.version - d.appliedFields.length;
            return (
              <li key={String(d._id)} className="staff-row" data-testid="ai-draft">
                <p className="record-chips">
                  <strong>{t("draftFrom", { date: date.format(d.createdAt) })}</strong>
                  <span className="record-sub">{d.model}</span>
                  {d.instructions ? <span className="record-sub">{t("note", { note: d.instructions })}</span> : null}
                </p>
                {stale ? <p className="admin-notice">{t("stale")}</p> : null}
                {(Object.keys(d.fields) as AiField[]).map((f) => {
                  const applied = d.appliedFields.includes(f);
                  return (
                    <div key={f} className="ai-field" data-testid={`ai-field-${f}`}>
                      <h3 className="field-label">{t(`fields.${f}`)}</h3>
                      <div className="ai-compare">
                        <div>
                          <p className="record-sub">{t("current")}</p>
                          <Text value={liveValue(product, f)} empty={t("emptyField")} />
                        </div>
                        <div>
                          <p className="record-sub">{t("proposed")}</p>
                          <Text value={d.fields[f]} empty={t("emptyField")} />
                        </div>
                      </div>
                      {applied ? (
                        <p className="record-sub">{t("applied")}</p>
                      ) : (
                        <ActionForm
                          action={applyAiFieldAction}
                          testId={`ai-apply-${f}`}
                          hidden={{ draftId: String(d._id), draftVersion: String(d.version), field: f, version: String(product.version) }}
                          fields={[]}
                          messages={messages}
                          submitLabel={t("apply", { field: t(`fields.${f}`) })}
                          pendingLabel={t("applying")}
                          layout="inline"
                        />
                      )}
                    </div>
                  );
                })}
                <ActionForm
                  action={discardAiDraftAction}
                  testId="ai-discard"
                  hidden={{ draftId: String(d._id), draftVersion: String(d.version) }}
                  fields={[]}
                  messages={messages}
                  submitLabel={t("discard")}
                  pendingLabel={t("discard")}
                  variant="secondary"
                  layout="inline"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
