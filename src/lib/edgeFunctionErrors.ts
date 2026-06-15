const GENERIC_EDGE_MESSAGES = [
  /edge function returned a non-2xx status code/i,
  /functions?http error/i,
  /non-2xx status code/i,
];

const pickMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const candidates = [body.details, body.error_description, body.error, body.message];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
};

export const getReadableEdgeFunctionError = async (
  error: unknown,
  fallback = "Request failed. Please try again.",
): Promise<string> => {
  const err = error as { message?: string; context?: unknown; readableMessage?: string } | null | undefined;
  if (err?.readableMessage) return err.readableMessage;

  let readable = typeof err?.message === "string" && err.message.trim() ? err.message.trim() : fallback;

  try {
    const context = err?.context as Response | undefined;
    if (context && typeof context.text === "function") {
      const response = typeof context.clone === "function" ? context.clone() : context;
      const text = await response.text();
      if (text) {
        try {
          readable = pickMessage(JSON.parse(text)) || text;
        } catch {
          readable = text;
        }
      }
    }
  } catch {
    // Keep the best message we already have.
  }

  if (GENERIC_EDGE_MESSAGES.some((pattern) => pattern.test(readable))) return fallback;
  return readable;
};

export const installReadableEdgeFunctionErrors = (supabaseClient: { functions?: { invoke?: Function } }) => {
  const functions = supabaseClient.functions;
  if (!functions?.invoke || (functions.invoke as { __readableErrorsInstalled?: boolean }).__readableErrorsInstalled) return;

  const originalInvoke = functions.invoke.bind(functions);
  const patchedInvoke = async (...args: unknown[]) => {
    const result = await originalInvoke(...args);
    if (result?.error) {
      const readableMessage = await getReadableEdgeFunctionError(result.error);
      result.error.readableMessage = readableMessage;
      try {
        Object.defineProperty(result.error, "message", {
          value: readableMessage,
          configurable: true,
        });
      } catch {
        // Some Error objects may not allow redefining message.
      }
    }
    return result;
  };

  (patchedInvoke as { __readableErrorsInstalled?: boolean }).__readableErrorsInstalled = true;
  functions.invoke = patchedInvoke;
};