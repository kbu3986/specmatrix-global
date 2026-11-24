/**
 * Shared clipboard helper with Navigator Clipboard API primary path
 * and safe DOM selection fallback (zero TypeScript deprecation hints).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to DOM fallback when Clipboard API is blocked or non-HTTPS
    }
  }

  if (typeof document === "undefined" || !document.body) {
    return false;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  ta.style.opacity = "0";

  document.body.appendChild(ta);
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const legacyDoc = document as unknown as {
      execCommand?: (commandId: string) => boolean;
    };
    return typeof legacyDoc.execCommand === "function"
      ? Boolean(legacyDoc.execCommand("copy"))
      : false;
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}
