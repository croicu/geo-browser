import type { Logger } from "../../src/contracts";

export class StubLogger implements Logger {
    public readonly calls: Array<{ message: string; props?: Record<string, unknown> }> = [];

    diagnostic(message: string, props?: Record<string, unknown>): void {
        this.calls.push({ message, props });
    }

    info(): void {}
    warning(): void {}
    error(): void {}
    fatal(): void {}
}
