import { describe, it, expect, vi, beforeEach } from "vitest";
import { fail, AppError } from "../../src/errors";
import { setLogger } from "../../src/services";
import type { Logger } from "../../src/protocols";

describe("errors", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      diagnostic: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn()
    };

    setLogger(mockLogger);
  });

  it("fail() throws AppError", () => {
    expect(() =>
      fail("test.error", "something broke")
    ).toThrow(AppError);
  });

  it("preserves code, message, props", () => {
    try {
      fail("test.error", "boom", undefined, { a: 1 });
    } catch (err) {
      const e = err as AppError;

      expect(e.code).toBe("test.error");
      expect(e.message).toBe("boom");
      expect(e.props).toEqual({ a: 1 });
    }
  });

  it("calls logger.error", () => {
    try {
      fail("test.error", "boom", undefined, { a: 1 });
    } catch {}

    expect(mockLogger.error).toHaveBeenCalledOnce();
  });

  it("propagates cause", () => {
    const cause = new Error("root");

    try {
      fail("test.error", "boom", cause);
    } catch (err) {
      const e = err as AppError;
      expect(e.cause).toBe(cause);
    }
  });
});