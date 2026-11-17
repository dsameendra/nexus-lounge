interface Logger {
  error(context: object, message: string): void;
  warn(context: object, message: string): void;
}

let current: Logger = console;

export function setLogger(logger: Logger) {
  current = logger;
}

export const log: Logger = {
  error: (context, message) => current.error(context, message),
  warn: (context, message) => current.warn(context, message),
};

// Runs fire-and-forget work so that neither a synchronous throw nor a rejection escapes.
export function guard(label: string, task: () => unknown, context: object = {}) {
  const report = (error: unknown) => log.error({ err: error, ...context }, `${label} failed`);
  try {
    Promise.resolve(task()).catch(report);
  } catch (error) {
    report(error);
  }
}
