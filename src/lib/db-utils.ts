export function getAffectedRows(result: unknown): number {
  if (typeof result === "object" && result !== null) {
    if ("affectedRows" in result) {
      const value = (result as { affectedRows: unknown }).affectedRows;
      if (typeof value === "number") return value;
    }
    if ("rowsAffected" in result) {
      const value = (result as { rowsAffected: unknown }).rowsAffected;
      if (typeof value === "number") return value;
    }
  }

  if (Array.isArray(result)) {
    for (const item of result) {
      const value = getAffectedRows(item);
      if (value > 0) return value;
    }
  }

  return 0;
}
