import React, { useEffect, useState } from 'react';
import { NewsArticle } from '../types';
import { ExternalLink, TrendingUp, RefreshCw } from 'lucide-react';

const FALLBACK_TOPICS: NewsArticle[] = [
  { title: "India economy growth 2025", summary: "Search for latest economic outlook.", url: "#", category: "Economy" },
  { title: "Viksit Bharat 2047 vision", summary: "Explore long-term national vision.", url: "#", category: "Policy" },
  { title: "Indian space missions Chandrayaan", summary: "Latest in space exploration.", url: "#", category: "Science" },
];

interface NewsFeedProps {
  onArticleClick: (title: string) => void;
}

const NewsFeed: React.FC<NewsFeedProps> = ({ onArticleClick }) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [noConfig, setNoConfig] = useState(false);

  const fetchNews = async () => {
    setLoading(true);
    setNoConfig(false);
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/news`);
      const data = await res.json();
      const list = Array.isArray(data.articles) ? data.articles : [];
      setArticles(list.length > 0 ? list : FALLBACK_TOPICS);
      if (list.length === 0 && data.message) setNoConfig(true);
    } catch {
      setArticles(FALLBACK_TOPICS);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNews();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
        <p className="text-gray-500 animate-pulse">Scanning live global news...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-2 mb-6 sm:mb-8 border-b border-[#30363d] pb-4">
        <TrendingUp className="text-blue-500" />
        <h2 className="text-xl sm:text-2xl font-bold">Discover Live</h2>
      </div>
      {noConfig && (
        <p className="text-sm text-gray-500 mb-4">Configure SERPER_API_KEY in Vercel for live news. Showing suggested topics to explore.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {articles.map((article, idx) => (
          <div 
            key={idx}
            className="group bg-[#161b22] border border-[#30363d] rounded-xl sm:rounded-2xl p-4 sm:p-5 hover:border-blue-500/50 transition-all flex flex-col cursor-pointer touch-manual min-h-[100px] active:scale-[0.99]"
            onClick={() => onArticleClick(article.title)}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-2">
              {article.category}
            </span>
            <h3 className="text-lg font-bold mb-3 group-hover:text-blue-400 transition-colors leading-tight">
              {article.title}
            </h3>
            <p className="text-sm text-gray-400 mb-6 flex-1 line-clamp-3 leading-relaxed">
              {article.summary}
            </p>
            <div className="flex items-center justify-between pt-4 border-t border-[#30363d]">
              <span className="text-xs text-gray-500">Live Research Available</span>
              <ExternalLink size={14} className="text-gray-600 group-hover:text-blue-400" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewsFeed;
