import type { Logger } from "../../src/contracts";

export class StubLogger implements Logger {
    public readonly calls: Array<{ message: string; props?: Record<string, unknown>; category?: string }> = [];
    public readonly infoCalls: Array<{ message: string; props?: Record<string, unknown>; category?: string }> = [];
    public readonly warningCalls: Array<{ message: string; props?: Record<string, unknown>; category?: string }> = [];
    public readonly perfCalls: Array<{ description: string; elapsedSeconds: number }> = [];

    diagnostic(message: string, props?: Record<string, unknown>, category?: string): void {
        this.calls.push({ message, props, category });
    }

    info(message: string, props?: Record<string, unknown>, category?: string): void {
        this.infoCalls.push({ message, props, category });
    }

    warning(message: string, props?: Record<string, unknown>, category?: string): void {
        this.warningCalls.push({ message, props, category });
    }

    error(): void {}
    fatal(): void {}

    perf(description: string, elapsedSeconds: number): void {
        this.perfCalls.push({ description, elapsedSeconds });
    }
}
