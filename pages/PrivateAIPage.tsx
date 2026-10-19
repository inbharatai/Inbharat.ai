import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Laptop, Smartphone, Workflow } from 'lucide-react';
import { PRIVATE_AI_PAGES } from '../content/privateAI';
import { trackEvent } from '../lib/analytics';

const links=[{to:'/unoone',name:'UnoOne'},{to:'/unoone/power',name:'Power'},{to:'/unoone/mobile',name:'Mobile'},{to:'/enterprise-ai',name:'Enterprise'},{to:'/technology',name:'Technology'}];
const PrivateAIPage:React.FC=()=>{
 const {pathname}=useLocation();
 const page=PRIVATE_AI_PAGES.find(item=>item.path===pathname.replace(/\/+$/,'')) ?? PRIVATE_AI_PAGES[0];
 return <div className="min-h-screen overflow-x-hidden bg-[#030508] text-white">
  <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-[#f59f4f] focus:p-3 focus:text-black">Skip to content</a>
  <nav aria-label="Main navigation" className="sticky top-0 z-40 border-b border-white/10 bg-[#030508]/95 backdrop-blur-xl">
   <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
    <Link to="/" className="flex items-center gap-3 font-bold"><img src="/inbharat-logo.svg" width={32} height={32} alt="" />InBharat.ai</Link>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm">
     {links.map(item=><Link key={item.to} to={item.to} aria-current={item.to===page.path?'page':undefined} className={item.to===page.path?'font-semibold text-[#f59f4f]':'text-[#b4c8de] hover:text-white'}>{item.name}</Link>)}
    </div>
    <Link to="/contact" className="rounded-full border border-[#f59f4f]/40 px-4 py-2 text-xs font-semibold text-[#f59f4f] hover:bg-[#f59f4f]/10">Contact <ArrowRight size={13} className="inline" /></Link>
   </div>
  </nav>
  <main id="main-content">
   <header className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_80%_18%,rgba(245,159,79,.12),transparent_48%)]">
    <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.2fr_.8fr]">
     <div>
      <p className="text-xs font-bold uppercase tracking-[.26em] text-[#f59f4f]">{page.eyebrow}</p>
      <h1 className="mt-7 max-w-4xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">{page.h1}</h1>
      <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[#b4c8de]">{page.description}</p>
      <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#6fd3a3]/30 bg-[#6fd3a3]/[.06] px-4 py-2 text-xs text-[#b7f0d3]"><ShieldCheck size={15}/>{page.status}</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link to="/contact" onClick={()=>trackEvent('private_ai_pilot',{product:page.name})} className="inline-flex items-center gap-2 rounded-full bg-[#f59f4f] px-7 py-3 font-semibold text-[#070909] hover:bg-[#f8b56d]">Discuss early access <ArrowRight size={17}/></Link><Link to="/unoone" className="rounded-full border border-white/20 px-7 py-3 font-semibold hover:bg-white/5">Explore UnoOne</Link></div>
     </div>
     <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#121d22] to-[#080d12] p-7">
      <p className="mb-6 text-xs uppercase tracking-[.2em] text-[#9ab0c3]">Private AI architecture</p>
      <div className="space-y-4" role="img" aria-label="Conceptual diagram of device, permission and data layers, not a product screenshot">
       {[{t:'DEVICE',d:'Owner controlled',color:'#f59f4f',Icon:Laptop},{t:'AGENT',d:'Scoped actions',color:'#6fd3a3',Icon:Workflow},{t:'DATA',d:'Local-first boundary',color:'#80aef2',Icon:Smartphone}].map(({t,d,color,Icon},i)=><div key={t} className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#071016] p-5" style={{marginLeft:i*12}}><Icon size={22} style={{color}}/><div><p className="text-xs tracking-widest" style={{color}}>{t}</p><p className="mt-1 text-sm font-medium">{d}</p></div></div>)}
      </div>
      <p className="mt-6 text-xs leading-6 text-[#89a1b5]">Conceptual illustration. Availability depends on the tested release.</p>
     </div>
    </div>
   </header>
   <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-[#f59f4f]">Designed for real work</p>
    <h2 className="mt-4 max-w-2xl text-3xl font-semibold sm:text-4xl">Practical AI. Clear limits. User control.</h2>
    <p className="mt-5 max-w-3xl leading-8 text-[#b4c8de]">{page.audience}</p>
    <div className="mt-10 grid gap-5 md:grid-cols-3">{page.features.map((x,i)=><article key={x.title} className="rounded-2xl border border-white/10 bg-white/[.025] p-7"><p className="text-sm font-mono text-[#f59f4f]">0{i+1}</p><h3 className="mt-7 text-xl font-semibold">{x.title}</h3><p className="mt-4 text-sm leading-7 text-[#b4c8de]">{x.body}</p></article>)}</div>
   </section>
   <section className="border-y border-white/10 bg-[#0a1219]"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><h2 className="text-3xl font-semibold">How we approach privacy and trust</h2><div className="mt-10 grid gap-8 md:grid-cols-3">{page.sections.map(x=><article key={x.title} className="border-l-2 border-[#f59f4f]/70 pl-5"><h3 className="text-lg font-semibold">{x.title}</h3><p className="mt-4 text-sm leading-7 text-[#b4c8de]">{x.body}</p></article>)}</div></div></section>
   <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8"><h2 className="text-3xl font-semibold">Common questions</h2><div className="mt-8 divide-y divide-white/10 border-y border-white/10">{page.faqs.map(x=><details key={x.q} className="py-5"><summary className="cursor-pointer text-base font-semibold marker:text-[#f59f4f]">{x.q}</summary><p className="mt-4 max-w-3xl text-sm leading-7 text-[#b4c8de]">{x.a}</p></details>)}</div><div className="mt-16 rounded-3xl border border-[#f59f4f]/20 bg-[#f59f4f]/[.06] p-8 sm:p-12"><h2 className="text-2xl font-semibold">Let's discuss an appropriate pilot.</h2><p className="mt-4 text-[#b4c8de]">We will explain what is implemented, what has been tested and what still needs qualification.</p><Link to="/contact" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#f59f4f] px-6 py-3 font-semibold text-[#070909]">Contact InBharat <ArrowRight size={16}/></Link></div></section>
  </main>
  <footer className="border-t border-white/10 px-5 py-10"><div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-5 text-sm text-[#9ab0c3]"><span>InBharat.ai · Built in Bharat</span><div className="flex flex-wrap gap-5"><Link to="/about">About</Link><Link to="/technology">Technology</Link><Link to="/learn-ai-with-reeturaj">Learn AI</Link><Link to="/contact">Contact</Link><Link to="/privacy">Privacy</Link></div></div></footer>
 </div>;
};
export default PrivateAIPage;