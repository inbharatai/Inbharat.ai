import React from 'react';
import { Link } from 'react-router-dom';
import StaticLayout from './_StaticLayout';

const About: React.FC = () => (
  <StaticLayout
    eyebrow="About"
    title="Building practical AI for Bharat."
    description="InBharat is an independent AI product studio. We build affordable, voice-first, multilingual AI tools designed around Indian languages, devices, and everyday workflows."
  >
    <section>
      <h2 className="text-xl font-bold text-white">What we do</h2>
      <p>
        We design and ship AI products that are useful inside India — not adapted from elsewhere.
        That means voice-first input, support for eleven Indian languages, fast performance on
        mid-range devices and patchy networks, and pricing that fits Indian budgets.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">What we&apos;ve built</h2>
      <p>
        Our flagship product is <Link to="/app" className="text-[#f59f4f] underline-offset-4 hover:underline">InBharat AI</Link> —
        an agentic search and reasoning console with multiple specialised modes (research, coding,
        education, executive workflows, shopping) and live web search. Around it sits a family of
        focused tools — UniAssist.ai for education, UniBot on WhatsApp, KathaKitaab.AI for
        interactive stories, and Phoring for decision intelligence — explored in detail on the
        homepage.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">How we work</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Independent and self-funded. No outside investors yet.</li>
        <li>Open development on <a className="text-[#f59f4f] underline-offset-4 hover:underline" href="https://github.com/inbharatai" target="_blank" rel="noopener noreferrer">GitHub</a> for the products that benefit from it.</li>
        <li>Privacy-respecting by default — we store as little as we can get away with, and only what you give us.</li>
        <li>Multilingual from day one — English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Odia, and Assamese.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">Get in touch</h2>
      <p>
        For partnerships, support, feedback, or anything else — please use the{' '}
        <Link to="/contact" className="text-[#f59f4f] underline-offset-4 hover:underline">contact page</Link>.
      </p>
    </section>
  </StaticLayout>
);

export default About;
