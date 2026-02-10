
export enum AgentMode {
  STANDARD = 'STANDARD',
  RESEARCH = 'RESEARCH',
  CODER = 'CODER',
  EDUCATOR = 'EDUCATOR',
  CREATIVE = 'CREATIVE',
  BROWSER = 'BROWSER',
  EXECUTIVE = 'EXECUTIVE',
  SHOPPER = 'SHOPPER'
}

export enum ViewMode {
  HOME = 'HOME',
  DISCOVER = 'DISCOVER',
  LIBRARY = 'LIBRARY',
  LIVE = 'LIVE'
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

export type WidgetData = 
  | { type: 'CALENDAR', data: CalendarEvent }
  | { type: 'EMAIL', data: EmailDraft }
  | { type: 'PPTX', data: Presentation }
  | { type: 'SHOPPING', data: ProductItem[] };

// ---------------------------

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
