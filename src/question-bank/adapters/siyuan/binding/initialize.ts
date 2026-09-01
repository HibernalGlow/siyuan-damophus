import {
  attemptColumns,
  questionColumns,
  topicColumns,
  type AttemptField,
  type InitializeQuestionBankInput,
  type QuestionBankBinding,
  type QuestionBankInitializationPreview,
  type QuestionField,
  type TopicField,
} from "../binding-schema";
import { databaseMarkdown, hashToken } from "../binding-utils";
import type { SiyuanKernelClient } from "../types";
import { initializeAttributeView } from "./attribute-view";
import {
  configureQuestionRelation,
  configureQuestionRollups,
  configureTopicRelation,
  configureTopicRollups,
} from "./relations";
import { verifyQuestionBankBinding } from "./verify";

function initializationToken(preview: Omit<QuestionBankInitializationPreview, "token">): string {
  return hashToken(preview);
}

export const bindingAttribute = "custom-damophus-question-bank-binding";

export async function persistQuestionBankBinding(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<void> {
  await client.request("/api/attr/setBlockAttrs", {
    id: binding.systemDocumentId,
    attrs: { [bindingAttribute]: JSON.stringify(binding) },
  });
}

export function previewQuestionBankInitialization(
  input: InitializeQuestionBankInput,
): QuestionBankInitializationPreview {
  const questionBlockId = input.idGenerator();
  const questionAvId = input.idGenerator();
  const topicBlockId = input.idGenerator();
  const topicAvId = input.idGenerator();
  const attemptBlockId = input.idGenerator();
  const attemptAvId = input.idGenerator();
  const preview = {
    notebookId: input.notebookId,
    path: input.path,
    questionBlockId,
    questionAvId,
    topicBlockId,
    topicAvId,
    attemptBlockId,
    attemptAvId,
    questionColumns: questionColumns.map((column) => ({ ...column, keyId: input.idGenerator() })),
    topicColumns: topicColumns.map((column) => ({ ...column, keyId: input.idGenerator() })),
    attemptColumns: attemptColumns.map((column) => ({ ...column, keyId: input.idGenerator() })),
  };
  return { ...preview, token: initializationToken(preview) };
}

export async function confirmQuestionBankInitialization(
  client: SiyuanKernelClient,
  preview: QuestionBankInitializationPreview,
  expectedToken: string,
): Promise<QuestionBankBinding> {
  const { token: _token, ...plan } = preview;
  if (expectedToken !== preview.token || initializationToken(plan) !== preview.token) {
    throw new Error("Question bank initialization preview is stale or modified");
  }
  const existing = await client.request<string[]>("/api/filetree/getIDsByHPath", {
    notebook: preview.notebookId,
    path: preview.path,
  });
  if (existing.length > 0) {
    throw new Error(`A Damophus system document already exists (${existing[0]}); reconnect it instead`);
  }
  const markdown = [
    "# Damophus",
    "",
    "## Question Index",
    databaseMarkdown(preview.questionBlockId, preview.questionAvId),
    "",
    "## Topic Index",
    databaseMarkdown(preview.topicBlockId, preview.topicAvId),
    "",
    "## Attempt Log",
    databaseMarkdown(preview.attemptBlockId, preview.attemptAvId),
  ].join("\n");
  const systemDocumentId = await client.request<string>("/api/filetree/createDocWithMd", {
    notebook: preview.notebookId,
    path: preview.path,
    markdown,
  });
  const createdDocument = await client.request<{ kramdown: string }>("/api/block/getBlockKramdown", {
    id: systemDocumentId,
  });
  if (!createdDocument.kramdown.includes(preview.questionBlockId)
    || !createdDocument.kramdown.includes(preview.questionAvId)
    || !createdDocument.kramdown.includes(preview.topicBlockId)
    || !createdDocument.kramdown.includes(preview.topicAvId)
    || !createdDocument.kramdown.includes(preview.attemptBlockId)
    || !createdDocument.kramdown.includes(preview.attemptAvId)) {
    throw new Error("The /Damophus path was occupied during initialization; reconnect the existing document");
  }
  try {
    const questionKeys = await initializeAttributeView(
      client,
      preview.questionAvId,
      preview.questionBlockId,
      "block_id" as QuestionField,
      preview.questionColumns,
    );
    const attemptKeys = await initializeAttributeView(
      client,
      preview.attemptAvId,
      preview.attemptBlockId,
      "entry" as AttemptField,
      preview.attemptColumns,
    );
    const topicKeys = await initializeAttributeView(
      client,
      preview.topicAvId,
      preview.topicBlockId,
      "entry" as TopicField,
      preview.topicColumns,
    );
    const binding: QuestionBankBinding = {
      schemaVersion: 5,
      notebookId: preview.notebookId,
      systemDocumentId,
      questionIndex: {
        avId: preview.questionAvId,
        blockId: preview.questionBlockId,
        keys: questionKeys,
      },
      topicIndex: { avId: preview.topicAvId, blockId: preview.topicBlockId, keys: topicKeys },
      attemptLog: { avId: preview.attemptAvId, blockId: preview.attemptBlockId, keys: attemptKeys },
    };
    await configureQuestionRelation(client, binding);
    await configureTopicRelation(client, binding);
    await configureQuestionRollups(client, binding);
    await configureTopicRollups(client, binding);
    const verification = await verifyQuestionBankBinding(client, binding);
    if (!verification.ok) {
      throw new Error(`Question bank initialization verification failed: ${verification.errors.join("; ")}`);
    }
    await persistQuestionBankBinding(client, binding);
    return binding;
  } catch (error) {
    try {
      await client.request("/api/filetree/removeDocByID", { id: systemDocumentId });
    } catch (cleanupError) {
      throw new Error(
        `Question bank initialization failed and cleanup also failed: ${error instanceof Error ? error.message : String(error)}; ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
    throw error;
  }
}
