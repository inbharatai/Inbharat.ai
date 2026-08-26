import React from 'react';
import { Link } from 'react-router-dom';
import StaticLayout from './_StaticLayout';
import { PatentBadge } from '../components/PatentBadge';
import { DEEP_TECH_PROJECTS } from '../content/deepTech';

const About: React.FC = () => (
  <StaticLayout
    eyebrow="About"
    title="Foundational AI infrastructure, engineered in Bharat."
    description="InBharat.ai is a deep-tech artificial intelligence company building trustworthy, private and local-first AI — including SILT and Pocket AI, both patent pending in India."
  >
    <section>
      <h2 className="text-xl font-bold text-white">What we do</h2>
      <p>
        InBharat.ai builds the foundational systems that make trustworthy, private and local-first AI
        real. Our work is organised in three layers: foundational deep tech (SILT and Pocket AI),
        applied AI infrastructure (JAK Shield, JAK Swarm, UnoOne, and InBharat Audio), and practical
        products (InBharat AI Console, UniAssist.ai, TestsPrep.in, KathaKitaab, and Sahayaak).
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">Foundational deep tech</h2>
      <div className="space-y-4">
        {DEEP_TECH_PROJECTS.map((project) => (
          <div
            key={project.id}
            className="rounded-xl border border-[#f59f4f]/20 bg-[#f59f4f]/[0.05] p-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold text-white">{project.title}</h3>
              <PatentBadge applicationNo={project.applicationNo} />
            </div>
            <p className="mt-2 text-[#96b0c8]">{project.description}</p>
            <p className="mt-2 text-sm text-[#96b0c8]">
              Pillars: {project.pillars.join(' · ')}
            </p>
          </div>
        ))}
      </div>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">What we&apos;ve built</h2>
      <p>
        Our flagship product is{' '}
        <Link to="/app" className="text-[#f59f4f] underline-offset-4 hover:underline">
          InBharat AI
        </Link>{' '}
        — an agentic search and reasoning console with multiple specialised modes (research, coding,
        education, executive workflows, shopping) and live web search. Around it sits a family of
        focused tools — UniAssist.ai for education, UniBot on WhatsApp, KathaKitaab for
        interactive stories, Phoring for decision intelligence, and JAK Swarm for company-wide agent
        work — explored in detail on the homepage.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">How we work</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Independent and self-funded. No outside investors yet.</li>
        <li>
          Open development on{' '}
          <a
            className="text-[#f59f4f] underline-offset-4 hover:underline"
            href="https://github.com/inbharatai"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>{' '}
          for the products and infrastructure that benefit from it.
        </li>
        <li>
          Privacy-respecting by default — SILT and Pocket AI are designed so sensitive data stays
          local unless the owner explicitly chooses otherwise.
        </li>
        <li>
          Multilingual from day one — English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati,
          Kannada, Malayalam, Odia, and Assamese.
        </li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">Get in touch</h2>
      <p>
        For partnerships, support, research collaboration, or anything else — please use the{' '}
        <Link to="/contact" className="text-[#f59f4f] underline-offset-4 hover:underline">
          contact page
        </Link>
        .
      </p>
    </section>
  </StaticLayout>
);

export default About;
