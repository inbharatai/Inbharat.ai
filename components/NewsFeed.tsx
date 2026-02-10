
import React, { useEffect, useState } from 'react';
import { NexusAgent } from '../services/openaiService';
import { NewsArticle } from '../types';
import { ExternalLink, TrendingUp, RefreshCw } from 'lucide-react';

interface NewsFeedProps {
  onArticleClick: (title: string) => void;
}

const NewsFeed: React.FC<NewsFeedProps> = ({ onArticleClick }) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = async () => {
    setLoading(true);
    const agent = new NexusAgent();
    const data = await agent.fetchTrendingNews();
    setArticles(data);
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
