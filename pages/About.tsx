import React from 'react';
import { Link } from 'react-router-dom';
import StaticLayout from './_StaticLayout';
import { PatentBadge } from '../components/PatentBadge';
import { DEEP_TECH_PROJECTS } from '../content/deepTech';

const About: React.FC = () => (
  <StaticLayout
    eyebrow="About"
    title="Foundational AI infrastructure, engineered in Bharat."
    description="InBharat.ai is a deep-tech artificial intelligence company building trustworthy, private and local-first AI — including UnoOne Power, UnoOne Mobile, secure enterprise agent controls and SILT research."
  >
    <section>
      <h2 className="text-xl font-bold text-white">What we do</h2>
      <p>
        InBharat.ai builds the foundational systems that make trustworthy, private and local-first AI
        real. Our work is organised in three layers: personal private AI (UnoOne Power and Mobile),
        enterprise agent safety (JAK Swarm and JAK Shield), and foundational research
        (SILT, local inference and resource-conscious AI).
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">Foundational deep tech</h2>
      <div className="space-y-4">
        {DEEP_TECH_PROJECTS.filter(project => project.id === 'silt').map((project) => (
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
          </div>
        ))}
      </div>
    </section>

    <p className="text-sm text-[#96b0c8]">Patent Pending research: SILT Indian application 202631101454 and historical portable AI application 202631102427. These are filing records, not production certifications. The pen-drive product is discontinued, and UnoOne Power and Mobile do not require it.</p>
    <section>
      <h2 className="text-xl font-bold text-white">What we&apos;ve built</h2>
      <p>Our flagship private personal AI is <Link to="/unoone" className="text-[#f59f4f] hover:underline">UnoOne</Link>, spanning Power for desktop and Mobile for Android. For organisations, <Link to="/enterprise-ai" className="text-[#f59f4f] hover:underline">JAK Swarm and JAK Shield</Link> focus on approvals, audit trails and safe agent execution. The <Link to="/app" className="text-[#f59f4f] hover:underline">InBharat AI Console</Link> and other applied products remain available. Our public descriptions distinguish development prototypes from tested releases.
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
          Privacy-conscious by design — supported local workflows keep processing on devices, while
          connected integrations operate under separately disclosed permissions.
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
