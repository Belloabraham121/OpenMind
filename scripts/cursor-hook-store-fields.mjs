/**
 * Cursor sends `conversation_id` and `generation_id` on hook stdin (common schema).
 * Forward them to the BFF so the dashboard can group prompt + edits + reply in Memory Explorer.
 */
export function cursorHookStoreFields(input) {
  const o = {}
  if (typeof input.generation_id === "string" && input.generation_id.trim()) {
    o.cursor_generation_id = input.generation_id.trim()
  }
  if (typeof input.conversation_id === "string" && input.conversation_id.trim()) {
    o.cursor_conversation_id = input.conversation_id.trim()
  }
  return o
}
