import React from 'react';
import { Github, Instagram, Linkedin, Mail, Twitter } from 'lucide-react';
import StaticLayout from './_StaticLayout';
import { SITE } from '../seo.config';
import { trackEvent } from '../lib/analytics';
import LeadCapture from '../components/LeadCapture';

const Contact: React.FC = () => {
  const channels = [
    {
      label: 'Email',
      value: SITE.contactEmail,
      href: `mailto:${SITE.contactEmail}`,
      icon: Mail,
      event: 'contact_click_email' as const,
      note: 'Best for partnerships, support, and detailed questions.',
    },
    {
      label: 'LinkedIn',
      value: 'in/reeturaj-goswami',
      href: SITE.social.linkedin,
      icon: Linkedin,
      event: 'contact_click_linkedin' as const,
      note: 'For professional inquiries and direct messages.',
    },
    {
      label: 'X',
      value: '@reetur_aj',
      href: SITE.social.twitter,
      icon: Twitter,
      event: 'contact_click_twitter' as const,
      note: 'For quick public threads and announcements.',
    },
    {
      label: 'Instagram',
      value: '@unigurus',
      href: SITE.social.instagram,
      icon: Instagram,
      event: 'contact_click_instagram' as const,
      note: 'For product launches, behind-the-scenes, and visuals.',
    },
    {
      label: 'GitHub',
      value: 'github.com/inbharatai',
      href: SITE.social.github,
      icon: Github,
      event: 'contact_click_github' as const,
      note: 'For open-source product issues and pull requests.',
    },
  ];

  return (
    <StaticLayout
      eyebrow="Contact"
      title="Get in touch."
      description="The fastest way to reach us is by email. We also read messages on LinkedIn, X, Instagram, and GitHub."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {channels.map(({ label, value, href, icon: Icon, event, note }) => (
          <a
            key={label}
            href={href}
            target={href.startsWith('mailto:') ? undefined : '_blank'}
            rel={href.startsWith('mailto:') ? undefined : 'noopener noreferrer me'}
            onClick={() => trackEvent(event)}
            className="group flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 transition-all hover:-translate-y-0.5 hover:border-[#f59f4f]/30 hover:bg-white/[0.04]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#0a0f18] text-[#f59f4f]">
              <Icon size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#9aafc6]">{label}</p>
              <p className="mt-1 truncate text-[14px] font-semibold text-white group-hover:text-[#f5b76f]">{value}</p>
              <p className="mt-1.5 text-[12.5px] leading-snug text-[#9aafc6]">{note}</p>
            </div>
          </a>
        ))}
      </div>

      <section className="mt-2">
        <h2 className="text-xl font-bold text-white">Send us a message</h2>
        <p className="mt-1.5 mb-3 text-[13.5px] leading-snug text-[#9aafc6]">
          Drop your email and a short message — it reaches our inbox at info@inbharat.ai. We reply to most messages within a few working days.
        </p>
        <LeadCapture
          kind="contact"
          showNameCompany
          showMessage
          notifyEndpoint="/api/contact"
          ctaLabel="Send message"
          placeholder="you@example.com"
          consentText="I agree to be contacted about this message. We never share your email."
        />
      </section>

      <section className="mt-2">
        <h2 className="text-xl font-bold text-white">A few quick notes</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>We answer most emails within a few working days. Please don&apos;t resend within 24 hours.</li>
          <li>For security disclosure, please email us with subject &ldquo;Security&rdquo;.</li>
          <li>We&apos;re an independent team, so we can&apos;t guarantee a reply to bulk vendor outreach.</li>
        </ul>
      </section>
    </StaticLayout>
  );
};

export default Contact;
