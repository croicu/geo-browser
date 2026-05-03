import { getLogger } from "./services";

export class AppError extends Error {
  public readonly code: string;
  public readonly props: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    cause?: unknown,
    props: Record<string, unknown> = {}
  ) {
    super(message, { cause });
    this.name = "AppError";

    this.code = code;
    this.props = props;
  }
}

export function fail(
  code: string,
  message: string,
  cause?: unknown,
  props: Record<string, unknown> = {}
): never {
  const err = new AppError(code, message, cause, props);

  getLogger().error(code, {
    message,
    ...props,
    cause,
  });

  throw err;
}
