
import React, { useState } from 'react';
import { Calendar, Clock, Users, Mail, Send, ShoppingBag, Star, CheckCircle2, PlaySquare, Download, Share2 } from 'lucide-react';
import { CalendarEvent, EmailDraft, Presentation, ProductItem, WidgetData } from '../types';

export const CalendarWidget: React.FC<{ event: CalendarEvent }> = ({ event }) => {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 w-full max-w-md my-4 shadow-xl">
      <div className="flex items-center gap-3 mb-4 border-b border-[#30363d] pb-3">
        <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500">
          <Calendar size={20} />
        </div>
        <div>
          <h3 className="text-white font-bold text-sm">Schedule Event</h3>
          <p className="text-xs text-gray-500">Executive Agent</p>
        </div>
      </div>
      
      <div className="space-y-3 mb-6">
        <h4 className="text-xl font-black text-white">{event.title}</h4>
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          <Clock size={14} />
          <span>{event.date} at {event.time} ({event.duration})</span>
        </div>
        {event.participants.length > 0 && (
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <Users size={14} />
            <span>{event.participants.join(', ')}</span>
          </div>
        )}
        <p className="text-sm text-gray-400 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]/50">
          {event.description}
        </p>
      </div>

      <button 
        onClick={() => setConfirmed(true)}
        disabled={confirmed}
        className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${confirmed ? 'bg-green-600 text-white' : 'bg-white text-black hover:bg-gray-200'}`}
      >
        {confirmed ? (
          <>
            <CheckCircle2 size={16} /> Invitation Sent
          </>
        ) : (
          "Confirm & Send Invites"
        )}
      </button>
    </div>
  );
};

export const EmailWidget: React.FC<{ draft: EmailDraft }> = ({ draft }) => {
  const [sent, setSent] = useState(false);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg my-4 shadow-xl overflow-hidden">
      <div className="bg-[#0d1117] p-4 border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2">
           <Mail size={16} className="text-blue-400" />
           <span className="text-xs font-bold text-gray-400">Draft Composer</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 border-b border-[#30363d] pb-2">
            <span className="text-xs font-bold text-gray-500 w-12">To:</span>
            <span className="text-sm text-white font-mono">{draft.to}</span>
          </div>
          <div className="flex items-center gap-3 border-b border-[#30363d] pb-2">
            <span className="text-xs font-bold text-gray-500 w-12">Subject:</span>
            <span className="text-sm text-white font-medium">{draft.subject}</span>
          </div>
        </div>
        
        <div className="bg-[#0d1117] rounded-xl p-4 min-h-[150px] text-sm text-gray-300 border border-[#30363d]/50 leading-relaxed whitespace-pre-wrap">
          {draft.body}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button className="px-4 py-2 rounded-lg border border-[#30363d] text-gray-400 text-xs font-bold hover:text-white transition-colors">
            Edit
          </button>
          <button 
            onClick={() => setSent(true)}
            disabled={sent}
            className={`px-6 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${sent ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
          >
            {sent ? <><CheckCircle2 size={14} /> Sent</> : <><Send size={14} /> Send Now</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export const PresentationWidget: React.FC<{ ppt: Presentation }> = ({ ppt }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl my-4 shadow-xl overflow-hidden">
      <div className="p-4 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
        <div className="flex items-center gap-2">
          <PlaySquare size={16} className="text-pink-500" />
          <span className="text-xs font-bold text-white truncate max-w-[200px]">{ppt.topic}.pptx</span>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded-lg text-[10px] font-bold text-gray-400 hover:text-white hover:border-pink-500/50 transition-all">
          <Download size={12} /> Export
        </button>
      </div>

      <div className="flex h-[300px]">
        {/* Sidebar */}
        <div className="w-24 bg-[#0d1117] border-r border-[#30363d] overflow-y-auto p-2 space-y-2 no-scrollbar">
          {ppt.slides.map((slide, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`w-full aspect-video rounded border flex flex-col items-center justify-center p-1 transition-all ${currentSlide === idx ? 'border-pink-500 bg-pink-500/10' : 'border-[#30363d] opacity-50 hover:opacity-100'}`}
            >
              <div className="w-full h-1 bg-gray-600 rounded-full mb-1" />
              <div className="w-2/3 h-1 bg-gray-700 rounded-full" />
              <span className="text-[8px] text-gray-500 mt-1">{idx + 1}</span>
            </button>
          ))}
        </div>

        {/* Main Slide */}
        <div className="flex-1 p-8 bg-[#1e232a] relative flex flex-col justify-center">
          <div className="absolute top-4 right-4 text-pink-500/20">
             <Share2 size={40} />
          </div>
          <h2 className="text-2xl font-black text-white mb-6 border-l-4 border-pink-500 pl-4">
            {ppt.slides[currentSlide].title}
          </h2>
          <ul className="space-y-3">
            {ppt.slides[currentSlide].content.map((point, idx) => (
              <li key={idx} className="flex items-start gap-3 text-gray-300 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 mt-2 flex-shrink-0" />
                {point}
              </li>
            ))}
          </ul>
          <span className="absolute bottom-4 right-4 text-[10px] text-gray-600 font-mono">
            SLIDE {currentSlide + 1} / {ppt.slides.length}
          </span>
        </div>
      </div>
    </div>
  );
};

export const ShoppingWidget: React.FC<{ items: ProductItem[] }> = ({ items }) => {
  return (
    <div className="w-full my-4">
      <div className="flex items-center gap-2 mb-4 px-1">
        <ShoppingBag size={16} className="text-green-400" />
        <span className="text-xs font-black uppercase tracking-widest text-gray-500">Global Market</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item, idx) => (
          <div key={idx} className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden group hover:border-green-500/50 transition-all">
            <div className="aspect-square bg-[#0d1117] relative p-4 flex items-center justify-center">
              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain mix-blend-screen opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-2 right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                {item.price}
              </div>
            </div>
            <div className="p-3">
              <h4 className="text-xs font-bold text-white line-clamp-2 mb-2 h-8">{item.name}</h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-yellow-500">
                  <Star size={10} fill="currentColor" />
                  <span>{item.rating}</span>
                </div>
                <span className="text-[9px] text-gray-500 uppercase">{item.source}</span>
              </div>
              <button className="w-full mt-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-[10px] font-bold text-gray-400 group-hover:text-white group-hover:bg-green-600/10 group-hover:border-green-500/30 transition-all">
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AgentWidgetRenderer: React.FC<{ data: WidgetData }> = ({ data }) => {
  switch (data.type) {
    case 'CALENDAR': return <CalendarWidget event={data.data} />;
    case 'EMAIL': return <EmailWidget draft={data.data} />;
    case 'PPTX': return <PresentationWidget ppt={data.data} />;
    case 'SHOPPING': return <ShoppingWidget items={data.data} />;
    default: return null;
  }
};
