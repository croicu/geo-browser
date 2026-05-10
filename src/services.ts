import { AppError } from "./errors";
import type { Logger } from "./contracts";

export const services = {
    setLogger,
    getLogger,
};

let logger: Logger | undefined;

export function setLogger(value: Logger): void {
    logger = value;
}

export function getLogger(): Logger {
    if (!logger) {
        throw new AppError("logger.not_initialized", "Logger not initialized");
    }

    return logger;
}