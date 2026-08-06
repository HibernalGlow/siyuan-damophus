import { ExamSessionSnapshotSchema, type ExamSessionSnapshot } from "../question-bank/exam";
import type { PluginDataApi } from "./session-host";

const examStorageName = "damophus-exam-sessions";

interface ExamFile {
  schema_version: 1;
  session?: unknown;
}

function parseFile(value: unknown): ExamFile {
  if (value === undefined || value === null || value === "") return { schema_version: 1 };
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error("Exam session storage contains invalid JSON");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Exam session storage is invalid");
  }
  const root = parsed as { schema_version?: unknown; session?: unknown };
  if (root.schema_version !== 1) throw new Error("Exam session storage version is unsupported");
  return { schema_version: 1, session: root.session };
}

export class SiyuanExamSessionRepository {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly data: PluginDataApi) {}

  private async read(): Promise<ExamFile> {
    return parseFile(await this.data.loadData(examStorageName));
  }

  private async write(file: ExamFile): Promise<void> {
    await this.data.saveData(examStorageName, file);
  }

  private async exclusiveWrite<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.writeChain;
    let release!: () => void;
    this.writeChain = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const locks = globalThis.navigator?.locks;
      return locks ? await locks.request(`${examStorageName}-write`, operation) : await operation();
    } finally {
      release();
    }
  }

  async load(): Promise<ExamSessionSnapshot | undefined> {
    const file = await this.read();
    if (file.session === undefined) return undefined;
    return ExamSessionSnapshotSchema.parse(file.session) as ExamSessionSnapshot;
  }

  async save(snapshot: ExamSessionSnapshot, expectedRevision?: number): Promise<void> {
    await this.exclusiveWrite(async () => {
      const file = await this.read();
      const current = file.session === undefined
        ? undefined
        : ExamSessionSnapshotSchema.parse(file.session) as ExamSessionSnapshot;
      if (expectedRevision !== undefined && current?.revision !== expectedRevision) {
        throw new Error("Exam session changed in another window");
      }
      if (expectedRevision === undefined && current && current.exam_id !== snapshot.exam_id) {
        throw new Error("Another exam session is already active");
      }
      file.session = ExamSessionSnapshotSchema.parse(snapshot);
      await this.write(file);
    });
  }

  async remove(examId?: string): Promise<void> {
    await this.exclusiveWrite(async () => {
      const file = await this.read();
      if (examId && file.session) {
        const current = ExamSessionSnapshotSchema.parse(file.session) as ExamSessionSnapshot;
        if (current.exam_id !== examId) throw new Error("Exam session changed in another window");
      }
      delete file.session;
      await this.write(file);
    });
  }

  async diagnostic(): Promise<string> {
    const file = await this.read();
    return JSON.stringify(file, null, 2);
  }
}
