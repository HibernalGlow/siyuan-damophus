import type { QuestionBankBinding } from "../binding-schema";
import { hashToken } from "../binding-utils";
import type { SiyuanKernelClient } from "../types";
import { bindingAttribute } from "./initialize";
import { migrateQuestionBankBinding } from "./migrate";
import { repairQuestionBankBinding } from "./repair";
import { verifyQuestionBankBinding, type ManagedKeyRepair } from "./verify";

export interface QuestionBankRebindingPreview {
  token: string;
  systemDocumentId: string;
  binding: QuestionBankBinding;
  bindingRepairs: ManagedKeyRepair[];
}

function rebindingToken(binding: QuestionBankBinding, bindingRepairs: readonly ManagedKeyRepair[]): string {
  return hashToken({ binding, bindingRepairs });
}

export async function previewQuestionBankRebinding(
  client: SiyuanKernelClient,
  systemDocumentId: string,
): Promise<QuestionBankRebindingPreview> {
  const attrs = await client.request<Record<string, string>>("/api/attr/getBlockAttrs", {
    id: systemDocumentId,
  });
  const source = attrs[bindingAttribute];
  if (!source) {
    throw new Error("This document has no Damophus question-bank binding manifest");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The Damophus question-bank binding manifest is invalid JSON");
  }
  const binding = migrateQuestionBankBinding(value);
  if (!binding) throw new Error("The Damophus question-bank binding manifest is invalid");
  if (binding.systemDocumentId !== systemDocumentId) {
    throw new Error("The binding manifest belongs to a different system document");
  }
  const verification = await verifyQuestionBankBinding(client, binding);
  if (verification.fatalErrors.length > 0) {
    throw new Error(`Question bank binding is invalid: ${verification.fatalErrors.join("; ")}`);
  }
  return {
    token: rebindingToken(binding, verification.missingManagedKeys),
    systemDocumentId,
    binding,
    bindingRepairs: verification.missingManagedKeys,
  };
}

export async function confirmQuestionBankRebinding(
  client: SiyuanKernelClient,
  systemDocumentId: string,
  expectedToken: string,
): Promise<QuestionBankBinding> {
  const preview = await previewQuestionBankRebinding(client, systemDocumentId);
  if (preview.token !== expectedToken) {
    throw new Error("Question bank rebinding preview is stale; preview it again");
  }
  await repairQuestionBankBinding(client, preview.binding, preview.bindingRepairs);
  return preview.binding;
}
