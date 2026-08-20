export type ConversationTabView = "active" | "archived";

/** Returns the view selected by standard horizontal-tab keyboard commands. */
export function getConversationTabNextView(
  currentView: ConversationTabView,
  key: string,
): ConversationTabView | null {
  if (key === "Home") return "active";
  if (key === "End") return "archived";
  if (key === "ArrowRight" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowUp") {
    return currentView === "active" ? "archived" : "active";
  }
  return null;
}
