/**
 * Credential UI primitives, driven entirely by content/credentials.ts.
 *
 *  - <CredentialRail />      compact pill row. Landing hero + anywhere that
 *                            needs proof-at-a-glance without eating vertical space.
 *  - <CredentialsShowcase /> full grouped grid. The Building-with-Reeturaj page.
 *  - <CredentialTrustList /> dense list for the landing Mission "trust" card.
 *
 * Deliberately free of `window`/`document` access at module and render scope so
 * these survive the static-shell prerender in scripts/build-seo.ts.
 *
 * Artwork: entries render as typographic badges. When an official asset lands in
 * /public/credentials/ and `logo` is set on the credential, the <img> path takes
 * over automatically — no changes needed here.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Award, BadgeCheck, ExternalLink, GraduationCap, Landmark } from 'lucide-react';
import {
  CATEGORY_LABEL,
  CREDENTIALS,
  FEATURED_CREDENTIALS,
  credentialsByCategory,
  type Credential,
  type CredentialCategory,
} from '../content/credentials';

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const CATEGORY_ICON: Record<
  CredentialCategory,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  recognition: Landmark,
  program: Award,
  certification: GraduationCap,
  badge: BadgeCheck,
};

/** Government recognition earns the warm accent; everything else stays calm. */
const CATEGORY_ACCENT: Record<CredentialCategory, string> = {
  recognition: '#f59f4f',
  program: '#6f8dff',
  certification: '#10b981',
  badge: '#96b0c8',
};

function CredentialLogo({ credential, size = 16 }: { credential: Credential; size?: number }) {
  const Icon = CATEGORY_ICON[credential.category];
  if (credential.logo) {
    return (
      <img
        src={credential.logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="h-4 w-4 shrink-0 object-contain"
      />
    );
  }
  return <Icon size={size} className="shrink-0" />;
}

/* ------------------------------------------------------------------ */
/* Compact rail                                                        */
/* ------------------------------------------------------------------ */

export const CredentialRail: React.FC<{
  className?: string;
  /** Defaults to the featured set. Pass CREDENTIALS for the full list. */
  items?: Credential[];
  /** Screen-reader label for the group. */
  label?: string;
}> = ({ className = '', items = FEATURED_CREDENTIALS, label = 'Recognitions and programmes' }) => {
  const reduceMotion = useReducedMotion();

  if (items.length === 0) return null;

  return (
    <motion.ul
      aria-label={label}
      initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25, ease }}
      className={`flex list-none flex-wrap items-center gap-2 p-0 ${className}`}
    >
      {items.map((c) => {
        const accent = CATEGORY_ACCENT[c.category];
        const inner = (
          <>
            <span style={{ color: accent }} className="inline-flex">
              <CredentialLogo credential={c} size={14} />
            </span>
            <span className="whitespace-nowrap">{c.short}</span>
            {c.verifyUrl && <ExternalLink size={11} className="opacity-50" aria-hidden="true" />}
          </>
        );

        const base =
          'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold tracking-wide backdrop-blur-sm transition-colors';
        const tone = {
          borderColor: `${accent}44`,
          backgroundColor: `${accent}14`,
          color: accent,
        } as React.CSSProperties;

        return (
          <li key={c.id}>
            {c.verifyUrl ? (
              <a
                href={c.verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`${c.title} — ${c.issuer}`}
                className={`${base} hover:brightness-125`}
                style={tone}
              >
                {inner}
              </a>
            ) : (
              <span title={`${c.title} — ${c.issuer}`} className={base} style={tone}>
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </motion.ul>
  );
};

/* ------------------------------------------------------------------ */
/* Dense trust list                                                    */
/* ------------------------------------------------------------------ */

export const CredentialTrustList: React.FC<{ items?: Credential[]; className?: string }> = ({
  items = FEATURED_CREDENTIALS,
  className = '',
}) => (
  <ul className={`list-none space-y-3 p-0 ${className}`}>
    {items.map((c) => {
      const accent = CATEGORY_ACCENT[c.category];
      return (
        <li
          key={c.id}
          className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
              aria-hidden="true"
            >
              <CredentialLogo credential={c} size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{c.short}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#9aafc6]">{c.issuer}</p>
            </div>
          </div>
        </li>
      );
    })}
  </ul>
);

/* ------------------------------------------------------------------ */
/* Full showcase                                                       */
/* ------------------------------------------------------------------ */

const CredentialCard: React.FC<{ credential: Credential; index: number }> = ({
  credential: c,
  index,
}) => {
  const reduceMotion = useReducedMotion();
  const accent = CATEGORY_ACCENT[c.category];

  return (
    <motion.article
      initial={reduceMotion ? undefined : { opacity: 0, y: 24, scale: 0.98 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease, delay: Math.min(index * 0.05, 0.3) }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.12]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }}
      />

      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
          aria-hidden="true"
        >
          <CredentialLogo credential={c} size={18} />
        </span>
        {c.period && (
          <span className="rounded-full border border-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7f97ae]">
            {c.period}
          </span>
        )}
      </div>

      <h3 className="mt-4 text-[15px] font-semibold leading-snug text-white">{c.title}</h3>
      <p className="mt-1.5 text-[12px] font-medium uppercase tracking-[0.12em]" style={{ color: accent }}>
        {c.issuer}
      </p>
      <p className="mt-3 flex-1 text-sm leading-[1.7] text-[#a6bdd4]">{c.description}</p>

      {c.verifyUrl && (
        <a
          href={c.verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#96b0c8] transition-colors hover:text-white"
        >
          Verify credential
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </motion.article>
  );
};

export const CredentialsShowcase: React.FC<{
  /** Group into labelled category blocks, or render one flat grid. */
  grouped?: boolean;
  className?: string;
}> = ({ grouped = true, className = '' }) => {
  if (!grouped) {
    return (
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
        {CREDENTIALS.map((c, i) => (
          <CredentialCard key={c.id} credential={c} index={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-10 ${className}`}>
      {credentialsByCategory().map((group) => (
        <div key={group.category}>
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#96b0c8]">
              {CATEGORY_LABEL[group.category]}
            </h3>
            <span className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
            <span className="text-[11px] font-semibold text-[#5f7691]">{group.items.length}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((c, i) => (
              <CredentialCard key={c.id} credential={c} index={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
