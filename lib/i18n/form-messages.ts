// Strings for ActionForm, resolved on the server so client components receive only what they render.
import { getMessages } from "next-intl/server";
import type { FormMessages } from "@/components/forms/ActionForm";

export async function formMessages(locale: "bn" | "en"): Promise<FormMessages> {
  const messages = (await getMessages({ locale })) as unknown as { forms: FormMessages };
  return messages.forms;
}
