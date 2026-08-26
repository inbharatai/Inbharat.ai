import React from 'react';
import { ArrowUpRight, Github, ShieldCheck, Cpu } from 'lucide-react';
import { DEEP_TECH_PROJECTS } from '../content/deepTech';
import { PatentBadge } from './PatentBadge';

const ICONS = {
  silt: ShieldCheck,
  pai: Cpu,
};

export const DeepTechSpotlight: React.FC = () => {
  return (
    <section id="deep-tech" className="relative z-10 py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#f59f4f]">
            Foundational Deep Tech
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Original AI infrastructure, not just applications.
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-[#9ab2c9] sm:text-base">
            InBharat is building foundational systems for how AI learns, where
            intelligence lives, how agentic systems are secured, and how local
            hardware can participate in advanced AI workflows.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {DEEP_TECH_PROJECTS.map((project) => {
            const Icon = ICONS[project.id];

            return (
              <article
                key={project.id}
                className="group relative overflow-hidden rounded-3xl border border-white/[0.08]
                           bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-6
                           transition-all duration-300 hover:-translate-y-1
                           hover:border-[#f59f4f]/30 sm:p-8"
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48
                             rounded-full bg-[#f59f4f]/[0.055] blur-3xl"
                  aria-hidden="true"
                />

                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl
                                    border border-white/[0.09] bg-[#0a0f18]">
                      <Icon size={23} className="text-[#f5b76f]" />
                    </div>
                    <PatentBadge applicationNo={project.applicationNo} />
                  </div>

                  <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.18em]
                                text-[#7e98b3]">
                    {project.category}
                  </p>

                  <h3 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                    {project.name}
                  </h3>

                  <p className="mt-2 text-lg font-semibold text-[#f7bd7b]">
                    {project.tagline}
                  </p>

                  <p className="mt-5 text-sm leading-7 text-[#9ab2c9]">
                    {project.description}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {project.pillars.slice(0, 5).map((pillar) => (
                      <span
                        key={pillar}
                        className="rounded-full border border-white/[0.08]
                                   bg-white/[0.025] px-3 py-1 text-[10px]
                                   font-semibold text-[#a6bdd3]"
                      >
                        {pillar}
                      </span>
                    ))}
                  </div>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href={project.publicUrl}
                      className="inline-flex items-center gap-2 rounded-full
                                 bg-gradient-to-r from-[#f59f4f] to-[#f5b76f]
                                 px-5 py-2.5 text-xs font-bold text-[#080b10]"
                    >
                      Explore {project.shortName}
                      <ArrowUpRight size={14} />
                    </a>

                    <a
                      href={project.repository}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border
                                 border-white/[0.1] bg-white/[0.025] px-5 py-2.5
                                 text-xs font-semibold text-[#c7d5e5]
                                 hover:border-white/[0.2]"
                    >
                      <Github size={14} />
                      GitHub
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
