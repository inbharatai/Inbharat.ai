import React from 'react';
import { Link } from 'react-router-dom';
import StaticLayout from './_StaticLayout';
import { PatentBadge } from '../components/PatentBadge';
import { DEEP_TECH_PROJECTS } from '../content/deepTech';

const About: React.FC = () => (
  <StaticLayout
    eyebrow="About"
    title="Foundational AI infrastructure, engineered in Bharat."
    description="InBharat.ai is a deep-tech artificial intelligence company building trustworthy, private and local-first AI — with PAI implemented through UnoOne Power (Windows) and UnoOne Mobile (Android), alongside SILT research."
  >
    <section>
      <h2 className="text-xl font-bold text-white">What we do</h2>
      <p>
        InBharat.ai builds the foundational systems that make trustworthy, private and local-first AI
        practical. Our flagship is PAI, one personal private AI agent, implemented through UnoOne Power
        (Windows) and UnoOne Mobile (Android). Research includes SILT and the historical Pocket AI
        portable architecture. Alongside this are applied infrastructure (JAK Shield, JAK Swarm,
        and InBharat Audio) and practical
        products (InBharat AI Console, UniAssist.ai, TestsPrep.in, KathaKitaab, and Sahayaak).
      </p>
      <p>Power is a Windows development build; Mobile is an Android alpha. No public UnoOne
        installer is offered, and phone–desktop continuity is not yet qualified end to end.</p>
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
              <h3 className="text-lg font-semibold text-white">{project.name}</h3>
              <PatentBadge applicationNo={project.applicationNo} />
            </div>
            <p className="mt-2 text-[#96b0c8]">{project.description}</p>
            <p className="mt-2 text-sm text-[#96b0c8]">
              Pillars: {project.pillars.join(' · ')}
            </p>
            <p className="mt-3 flex flex-wrap gap-4 text-sm">
              <a href={project.publicUrl} className="text-[#f59f4f] underline">Explore {project.name}</a>
              <a href={project.repository} target="_blank" rel="noopener noreferrer" className="text-[#f59f4f] underline">
                {project.id === 'pai' ? 'Historical portable research source' : 'Research source'}
              </a>
            </p>
          </div>
        ))}
      </div>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">What we&apos;ve built</h2>
      <p>
        Our separate browser product is{' '}
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
          Local-first by design — UnoOne keeps personal memory encrypted per device. Approved
          searches, connectors, browser actions and uploads can transmit data to external services.
        </li>
        <li>
          Language selection includes English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati,
          Kannada, Malayalam, Odia, and Assamese. Translation coverage is partial; language
          selection does not establish speech or model support on every product.
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
