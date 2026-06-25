import React from 'react';
import { Link } from 'react-router-dom';
import StaticLayout from './_StaticLayout';
import { SITE } from '../seo.config';

const Privacy: React.FC = () => (
  <StaticLayout
    eyebrow="Legal"
    title="Privacy Policy"
    description="What InBharat AI collects, what it doesn't, and how authentication and chat history work."
    updated="2026-05-12"
  >
    <section>
      <h2 className="text-xl font-bold text-white">Who we are</h2>
      <p>
        InBharat AI (&ldquo;InBharat&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates this
        website and the InBharat AI console at <code>{SITE.url}</code>. This page explains what
        data we collect and how we handle it. If you have a question about it, email{' '}
        <a className="text-[#f59f4f] underline-offset-4 hover:underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">What we collect</h2>
      <p>We try to collect as little as we can. In practice, that means:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Account data</strong>, if you sign in: your email address and the authentication
          state Supabase needs to keep you signed in. Optional Google sign-in only shares your
          email and Google profile name.
        </li>
        <li>
          <strong>Chat history</strong>, if you are signed in: the messages you send and the
          responses you receive, so we can show them to you in your sidebar. Guests can use a small
          number of free messages without an account; nothing about guest sessions is stored on our
          servers beyond what your browser keeps in <code>localStorage</code>.
        </li>
        <li>
          <strong>Language preference</strong>: stored in your browser&apos;s <code>localStorage</code>{' '}
          under <code>appLanguage</code>. Never sent anywhere except to render translated UI.
        </li>
        <li>
          <strong>Technical request data</strong>: server logs (IP, user agent, timestamps) for
          operational debugging and abuse prevention, kept for a short window and then discarded.
        </li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">What we don&apos;t do</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>We don&apos;t sell your data.</li>
        <li>We don&apos;t train models on your chat content.</li>
        <li>We don&apos;t run third-party advertising trackers.</li>
        <li>We don&apos;t require a phone number to sign in.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">Third-party services</h2>
      <p>
        We use a small number of vendors to operate the product. Each receives only the data it
        needs to do its job:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Supabase</strong> — authentication and database for signed-in chat history.</li>
        <li><strong>OpenAI</strong> — runs the models that generate responses to your messages.</li>
        <li><strong>Serper</strong> — optional web-search lookups when a response needs live data.</li>
        <li><strong>Vercel</strong> — hosts the website and serverless API routes.</li>
      </ul>
      <p>
        InBharat AI integrates Google Analytics 4 for privacy-respecting traffic
        measurement. It is inactive until a measurement ID is configured — until then,
        no analytics script loads and no data is sent. When enabled, GA4 receives
        first-party page-view and event data using Google&apos;s default measurement
        cookies; we do not enable Google Ads or cross-site advertising tracking. You can
        review Google&apos;s data-retention and privacy terms at analytics.google.com.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">Your rights</h2>
      <p>
        You can sign out at any time. You can request deletion of your account and associated chat
        history by emailing{' '}
        <a className="text-[#f59f4f] underline-offset-4 hover:underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
        {' '}from your account email. We&apos;ll usually action it within a few working days.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">Cookies</h2>
      <p>
        We don&apos;t use third-party tracking cookies. Supabase sets a session cookie / token in
        your browser when you sign in, which is required for the product to work. Your browser&apos;s
        own <code>localStorage</code> stores your language preference and (for guests) a free-message
        counter.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">Changes to this policy</h2>
      <p>
        If we change how we handle data, we&apos;ll update this page and adjust the date at the top.
        See also our <Link to="/terms" className="text-[#f59f4f] underline-offset-4 hover:underline">Terms of Service</Link>.
      </p>
    </section>
  </StaticLayout>
);

export default Privacy;
