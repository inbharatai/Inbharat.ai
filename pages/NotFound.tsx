import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Home } from 'lucide-react';
import StaticLayout from './_StaticLayout';

const NotFound: React.FC = () => {
  // Surface a proper 404 status hint to anyone (incl. crawlers) inspecting
  // the document head. Vercel serves this via the SPA fallback, but the
  // robots meta below makes intent explicit.
  useEffect(() => {
    let el = document.head.querySelector<HTMLMetaElement>('meta[name="prerender-status-code"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'prerender-status-code');
      document.head.appendChild(el);
    }
    el.setAttribute('content', '404');
    return () => {
      el?.remove();
    };
  }, []);

  return (
    <StaticLayout
      eyebrow="404"
      title="We couldn't find that page."
      description="The link may be broken or the page may have moved. Try one of these instead:"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/"
          className="group flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 transition-all hover:-translate-y-0.5 hover:border-[#f59f4f]/30"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#9aafc6]">Start here</p>
            <p className="mt-1 text-[15px] font-semibold text-white">Homepage</p>
            <p className="mt-1 text-[12.5px] text-[#9aafc6]">All our products and what they do.</p>
          </div>
          <Home size={18} className="text-[#f59f4f] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <Link
          to="/app"
          className="group flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 transition-all hover:-translate-y-0.5 hover:border-[#f59f4f]/30"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#9aafc6]">Try it</p>
            <p className="mt-1 text-[15px] font-semibold text-white">InBharat AI Console</p>
            <p className="mt-1 text-[12.5px] text-[#9aafc6]">Voice-first agentic AI. Free to try.</p>
          </div>
          <ArrowRight size={18} className="text-[#f59f4f] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <Link
          to="/about"
          className="group flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 transition-all hover:-translate-y-0.5 hover:border-[#f59f4f]/30"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#9aafc6]">About</p>
            <p className="mt-1 text-[15px] font-semibold text-white">About InBharat</p>
            <p className="mt-1 text-[12.5px] text-[#9aafc6]">Who we are and how we work.</p>
          </div>
          <ArrowRight size={18} className="text-[#f59f4f] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <Link
          to="/contact"
          className="group flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 transition-all hover:-translate-y-0.5 hover:border-[#f59f4f]/30"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#9aafc6]">Reach us</p>
            <p className="mt-1 text-[15px] font-semibold text-white">Contact</p>
            <p className="mt-1 text-[12.5px] text-[#9aafc6]">Email and social channels.</p>
          </div>
          <ArrowRight size={18} className="text-[#f59f4f] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
    </StaticLayout>
  );
};

export default NotFound;
