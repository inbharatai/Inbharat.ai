
export enum AgentMode {
  STANDARD = 'STANDARD',
  RESEARCH = 'RESEARCH',
  CODER = 'CODER',
  EDUCATOR = 'EDUCATOR',
  BROWSER = 'BROWSER',
  EXECUTIVE = 'EXECUTIVE',
  SHOPPER = 'SHOPPER'
}

export enum ViewMode {
  HOME = 'HOME',
  DISCOVER = 'DISCOVER',
  LIBRARY = 'LIBRARY'
}

export interface Source {
  title: string;
  uri: string;
}

// --- Agentic Widget Types ---

export interface CalendarEvent {
  title: string;
  date: string;
  time: string;
  duration: string;
  participants: string[];
  description: string;
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export interface PresentationSlide {
  title: string;
  content: string[];
  imagePrompt?: string; // For generating slide background
}

export interface Presentation {
  topic: string;
  slides: PresentationSlide[];
}

export interface ProductItem {
  name: string;
  price: string;
  rating: number;
  imageUrl: string;
  source: string;
  link: string;
}

export interface CodeSnippet {
  language: string;
  code: string;
  explanation: string;
  filename?: string;
}

export interface ChartData {
  title: string;
  type: 'bar' | 'line' | 'pie' | 'table';
  labels: string[];
  datasets: Array<{ label: string; data: number[]; color?: string }>;
  description?: string;
}

export type WidgetData = 
  | { type: 'CALENDAR', data: CalendarEvent }
  | { type: 'EMAIL', data: EmailDraft }
  | { type: 'PPTX', data: Presentation }
  | { type: 'SHOPPING', data: ProductItem[] }
  | { type: 'CODE', data: CodeSnippet }
  | { type: 'CHART', data: ChartData };

// ---------------------------

export type MessageErrorCode =
  | "RATE_LIMIT"
  | "UPSTREAM_OVERLOADED"
  | "SERVER_ERROR"
  | "AUTH_ERROR"
  | "UNAUTHORIZED"
  | "GUEST_LIMIT"
  | "CONFIG_ERROR";

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  imageUrl?: string;
  videoUrl?: string;
  mode?: AgentMode;
  followUps?: string[];
  widget?: WidgetData; // New field for actionable UI
  model?: string; // Which LLM model was used
  /** When set, this is a sanitized error message; Retry enabled after retryAfterSeconds from errorShownAt. */
  errorCode?: MessageErrorCode;
  retryAfterSeconds?: number;
  /** Timestamp when this error was shown (for cooldown). */
  errorShownAt?: number;
  /** Whether this message is still being streamed. */
  isStreaming?: boolean;
  /** Live status text shown while thinking (e.g. "Searching…", "Writing response…"). */
  statusText?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  activeMode: AgentMode;
  timestamp: number;
}

export interface NewsArticle {
  title: string;
  summary: string;
  url: string;
  category: string;
}
