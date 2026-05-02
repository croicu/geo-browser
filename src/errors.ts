import { services } from "./services";

export class AppError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;
  public readonly props: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    cause?: unknown,
    props: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AppError";

    this.code = code;
    this.cause = cause;
    this.props = props;

    if (cause instanceof Error && cause.stack) {
      this.stack += "\nCaused by: " + cause.stack;
    }
  }
}

export function fail(
  code: string,
  message: string,
  cause?: unknown,
  props: Record<string, unknown> = {}
): never {
  const err = new AppError(code, message, cause, props);

  services.getLogger().error(code, err, props);

  throw err;
}
