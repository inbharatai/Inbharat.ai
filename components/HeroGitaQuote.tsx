import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const HeroGitaQuote: React.FC = () => {
  const { t } = useTranslation();
  const prefersReduced = useReducedMotion();

  return (
    <div className="relative z-10 w-full overflow-hidden">
      {/* Subtle top accent line */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-40 sm:w-64"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(245,159,79,0.4), transparent)',
        }}
        aria-hidden="true"
      />

      <motion.div
        className="mx-auto max-w-3xl px-5 sm:px-6 pt-6 pb-4 sm:pt-8 sm:pb-5 text-center"
        initial={prefersReduced ? undefined : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease }}
      >
        {/* Sanskrit Shloka */}
        <p
          className="text-[clamp(15px,3.2vw,22px)] leading-[1.8] sm:leading-[1.75] tracking-wide text-[#e6ecf5]/90"
          style={{
            fontFamily: '"Noto Serif Devanagari", "Noto Serif", Georgia, serif',
            fontWeight: 500,
          }}
          lang="sa"
        >
          कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।
          <br />
          मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥
        </p>

        {/* Thin decorative divider */}
        <div
          className="mx-auto my-3 sm:my-4 h-px w-12 sm:w-16"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(245,159,79,0.35), transparent)',
          }}
          aria-hidden="true"
        />

        {/* Translated motivational line */}
        <p className="text-[clamp(13px,2.4vw,16px)] leading-relaxed font-medium text-[#b0c0d8]/80 italic">
          &ldquo;{t('gitaTranslation')}&rdquo;
        </p>

        {/* Citation */}
        <p className="mt-2 sm:mt-3 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#5a6f8c]/70">
          {t('gitaCitation')}
        </p>
      </motion.div>

      {/* Subtle bottom accent line */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-28 sm:w-48"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(245,159,79,0.2), transparent)',
        }}
        aria-hidden="true"
      />
    </div>
  );
};

export default HeroGitaQuote;
