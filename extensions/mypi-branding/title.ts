import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

const TITLE_MAX_CHARS = 30;

function promptToTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > TITLE_MAX_CHARS
    ? normalized.slice(0, TITLE_MAX_CHARS)
    : normalized;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const textParts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const maybeText = part as { type?: unknown; text?: unknown };
    if (maybeText.type === "text" && typeof maybeText.text === "string") {
      textParts.push(maybeText.text);
    }
  }

  return textParts.join(" ");
}

function firstUserPromptFromBranch(entries: SessionEntry[]): string {
  for (const entry of entries) {
    if (entry.type !== "message") continue;

    const message = entry.message as { role?: unknown; content?: unknown };
    if (message.role !== "user") continue;

    const prompt = textFromContent(message.content);
    if (prompt.trim()) return prompt;
  }

  return "";
}

/**
 * Set the terminal/window title once from the first user prompt (deferred on session_start) or
 * from the prompt at agent start — same behavior as the title slice of startup-branding.
 */
export function registerWindowTitle(pi: ExtensionAPI): void {
  let titleSet = false;
  let sessionGeneration = 0;

  function setTitleFromPrompt(ctx: ExtensionContext, prompt: string): void {
    if (titleSet || !ctx.hasUI) return;

    const title = promptToTitle(prompt);
    if (!title) return;

    ctx.ui.setTitle(title);
    titleSet = true;
  }

  pi.on("session_start", async (_event, ctx) => {
    titleSet = false;
    const generation = ++sessionGeneration;

    if (!ctx.hasUI) return;

    setTimeout(() => {
      if (generation !== sessionGeneration) return;
      const prompt = firstUserPromptFromBranch(ctx.sessionManager.getBranch());
      setTitleFromPrompt(ctx, prompt);
    }, 200);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    setTitleFromPrompt(ctx, event.prompt);
  });
}
