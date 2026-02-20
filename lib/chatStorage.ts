import { supabase } from "./supabaseClient";
import { AgentMode } from "../types";
import type { ChatSession, Message } from "../types";

type DbSession = {
  id: string;
  user_id: string;
  title: string;
  active_mode: string;
  created_at: string;
  updated_at: string;
  chat_messages?: DbMessage[] | null;
};

type DbMessage = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  mode: string | null;
  sources: unknown;
  image_url: string | null;
  follow_ups: unknown;
  widget: unknown;
  error_code: string | null;
  retry_after_seconds: number | null;
  error_shown_at: string | null;
  created_at: string;
};

function dbMessageToMessage(row: DbMessage): Message {
  const msg: Message = {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content ?? "",
  };
  if (row.mode) msg.mode = row.mode as AgentMode;
  if (row.sources != null && Array.isArray(row.sources)) msg.sources = row.sources as Message["sources"];
  if (row.image_url) msg.imageUrl = row.image_url;
  if (row.follow_ups != null && Array.isArray(row.follow_ups)) msg.followUps = row.follow_ups as string[];
  if (row.widget != null && typeof row.widget === "object") msg.widget = row.widget as Message["widget"];
  if (row.error_code) msg.errorCode = row.error_code as Message["errorCode"];
  if (row.retry_after_seconds != null) msg.retryAfterSeconds = row.retry_after_seconds;
  if (row.error_shown_at) msg.errorShownAt = new Date(row.error_shown_at).getTime();
  return msg;
}

function dbSessionToChatSession(row: DbSession): ChatSession {
  const messages: Message[] = (row.chat_messages ?? [])
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(dbMessageToMessage);
  return {
    id: row.id,
    title: row.title,
    messages,
    activeMode: (row.active_mode as AgentMode) || AgentMode.STANDARD,
    timestamp: new Date(row.updated_at).getTime(),
  };
}

export async function loadSessions(userId: string): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*, chat_messages(*)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as DbSession[];
  return rows.map(dbSessionToChatSession);
}

export async function createSession(
  userId: string,
  params: { title: string; activeMode: AgentMode; firstMessage: Message }
): Promise<ChatSession> {
  const { data: sessionRow, error: sessionError } = await supabase
    .from("chat_sessions")
    .insert({
      user_id: userId,
      title: params.title,
      active_mode: params.activeMode,
    })
    .select("id, user_id, title, active_mode, created_at, updated_at")
    .single();

  if (sessionError) throw sessionError;
  const sessionId = sessionRow.id;

  const { error: msgError } = await supabase.from("chat_messages").insert({
    id: params.firstMessage.id,
    session_id: sessionId,
    role: params.firstMessage.role,
    content: params.firstMessage.content,
    mode: params.firstMessage.mode ?? null,
    image_url: params.firstMessage.imageUrl ?? null,
    sources: params.firstMessage.sources ?? null,
    follow_ups: params.firstMessage.followUps ?? null,
    widget: params.firstMessage.widget ?? null,
  });

  if (msgError) throw msgError;

  return {
    id: sessionId,
    title: params.title,
    messages: [params.firstMessage],
    activeMode: params.activeMode,
    timestamp: new Date(sessionRow.updated_at).getTime(),
  };
}

export async function appendMessage(
  sessionId: string,
  message: Message
): Promise<void> {
  const { error } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    id: message.id,
    role: message.role,
    content: message.content,
    mode: message.mode ?? null,
    sources: message.sources ?? null,
    image_url: message.imageUrl ?? null,
    follow_ups: message.followUps ?? null,
    widget: message.widget ?? null,
    error_code: message.errorCode ?? null,
    retry_after_seconds: message.retryAfterSeconds ?? null,
    error_shown_at: message.errorShownAt != null ? new Date(message.errorShownAt).toISOString() : null,
  });

  if (error) throw error;

  await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function updateSession(
  sessionId: string,
  updates: { title?: string; activeMode?: AgentMode }
): Promise<void> {
  const payload: { title?: string; active_mode?: string } = {};
  if (updates.title != null) payload.title = updates.title;
  if (updates.activeMode != null) payload.active_mode = updates.activeMode;
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("chat_sessions").update(payload).eq("id", sessionId);
  if (error) throw error;
}
