import type { AgentEvent, PasteResult } from "@hibernalglow/damophus-agent-contract";
import type { SpinnerResult } from "@clack/prompts";

export interface Reporter {
  event(event: AgentEvent): Promise<void>;
  info(value: unknown): Promise<void>;
  result(result: PasteResult): Promise<void>;
  error(error: Error): Promise<void>;
  confirmClose(message: string): Promise<boolean>;
}

class JsonReporter implements Reporter {
  private write(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }

  async event(event: AgentEvent): Promise<void> {
    this.write(event);
  }

  async info(value: unknown): Promise<void> {
    this.write({ type: "info", value });
  }

  async result(result: PasteResult): Promise<void> {
    this.write({ type: "result", value: result });
  }

  async error(error: Error): Promise<void> {
    this.write({
      type: "error",
      error: {
        name: error.name,
        message: error.message,
        code: "code" in error ? error.code : undefined,
      },
    });
  }

  async confirmClose(): Promise<boolean> {
    return false;
  }
}

class PlainReporter implements Reporter {
  async event(event: AgentEvent): Promise<void> {
    process.stdout.write(`[${event.type}] ${event.message}\n`);
  }

  async info(value: unknown): Promise<void> {
    process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  }

  async result(result: PasteResult): Promise<void> {
    process.stdout.write(`${result.status}: ${result.requestId}\n`);
  }

  async error(error: Error): Promise<void> {
    process.stderr.write(`${error.message}\n`);
  }

  async confirmClose(): Promise<boolean> {
    return false;
  }
}

class TtyReporter implements Reporter {
  private spinner?: SpinnerResult;
  private prompts?: Awaited<typeof import("@clack/prompts")>;

  private async api() {
    this.prompts ??= await import("@clack/prompts");
    return this.prompts;
  }

  async event(event: AgentEvent): Promise<void> {
    const prompts = await this.api();
    if (event.type === "completed") {
      this.spinner?.stop(event.message);
      return;
    }
    if (event.type === "failed") {
      this.spinner?.error(event.message);
      return;
    }
    if (!this.spinner) {
      this.spinner = prompts.spinner();
      this.spinner.start(event.message);
    } else {
      this.spinner.message(event.message);
    }
  }

  async info(value: unknown): Promise<void> {
    const prompts = await this.api();
    prompts.log.info(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }

  async result(result: PasteResult): Promise<void> {
    const prompts = await this.api();
    const message = `${result.completedItems.length} document(s), request ${result.requestId}`;
    if (result.status === "completed") prompts.log.success(message);
    else prompts.log.error(result.failure?.message ?? message);
  }

  async error(error: Error): Promise<void> {
    const prompts = await this.api();
    this.spinner?.error(error.message);
    if (!this.spinner) prompts.log.error(error.message);
  }

  async confirmClose(message: string): Promise<boolean> {
    const prompts = await this.api();
    this.spinner?.stop("Awaiting confirmation");
    this.spinner = undefined;
    const answer = await prompts.confirm({ message, initialValue: false });
    return !prompts.isCancel(answer) && answer === true;
  }
}

export function createReporter(json: boolean): Reporter {
  if (json) return new JsonReporter();
  if (process.stdout.isTTY && process.stderr.isTTY) return new TtyReporter();
  return new PlainReporter();
}
