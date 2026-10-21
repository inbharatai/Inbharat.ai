import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Laptop, Smartphone, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Signature UnoOne composition: the personal agent spanning a laptop and a phone.
 * Screens are AI-generated illustrative interface mockups (assets-source/unoone),
 * labelled "Illustrative interface" on the page. No live telemetry claims.
 */

const chipBase =
  'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold tracking-wide backdrop-blur-md';

const UnoOneDevices: React.FC<{
  showCards?: boolean;
  heading?: boolean;
  className?: string;
}> = ({ showCards = false, heading = true, className = '' }) => {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[#35e1cb]/[0.05] blur-[110px]"></div>
        <div className="absolute right-[8%] bottom-[6%] h-[260px] w-[260px] rounded-full bg-[#4c8bf5]/[0.06] blur-[90px]"></div>
      </div>

      {heading ? (
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {t('landDevicesHeading')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-7 text-[#b4c8de]">{t('landDevicesSub')}</p>
        </div>
      ) : null}

      {/* device scene */}
      <div className="relative mx-auto mt-14 max-w-5xl px-5 sm:px-8">
        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-10 sm:grid sm:grid-cols-[auto_auto] sm:items-end sm:justify-center sm:gap-6">
          {/* laptop */}
          <div className="flex min-w-0 flex-col items-center">
            <div
              className="w-[clamp(260px,60vw,460px)]"
              style={{ transform: 'perspective(1200px) rotateX(2deg)' }}
            >
              <div className="rounded-t-xl border border-white/20 bg-gradient-to-b from-[#1a2530] to-[#101a24] p-1.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
                <div className="overflow-hidden rounded-lg border border-black/60 bg-[#04070c]">
                  <img
                    src="/unoone/power-ui.png"
                    alt="Illustrative interface of the UnoOne Power desktop personal AI agent (not a live product screenshot)"
                    className="block h-auto w-full"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
              {/* base deck */}
              <div className="relative mx-auto h-3.5 w-[112%] rounded-b-xl border border-t-0 border-white/15 bg-gradient-to-b from-[#1e2a36] to-[#0d151d]">
                <div className="absolute left-1/2 top-0 h-[5px] w-16 -translate-x-1/2 rounded-b-md bg-black/50"></div>
              </div>
            </div>
            {/* status chip */}
            <div className="mt-5 flex justify-center">
              <span className={`${chipBase} border-[#91e7ae]/40 bg-[#0e1a14]/80 text-[#91e7ae]`}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#91e7ae]"></span>
                POWER · WORKING DEVELOPMENT BUILD
              </span>
            </div>
          </div>

          {/* phone */}
          <div className="relative self-end pb-1 sm:pb-4">
            <div
              className="w-[clamp(120px,26vw,178px)]"
              style={{ transform: 'perspective(1100px) rotateY(-7deg) rotateX(1deg)' }}
            >
              <div className="rounded-[2rem] border border-white/20 bg-gradient-to-b from-[#1a2530] to-[#0d151d] p-1.5 shadow-[0_26px_60px_-18px_rgba(0,0,0,0.85)]">
                <div className="relative overflow-hidden rounded-[1.6rem] border border-black/60 bg-[#04070c]">
                  <div className="absolute left-1/2 top-1.5 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-black/80"></div>
                  <img
                    src="/unoone/mobile-ui.png"
                    alt="Illustrative interface of the UnoOne Mobile Android personal AI agent (not a live product screenshot)"
                    className="block h-auto w-full"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
            </div>
            {/* status chip */}
            <div className="mt-4 flex justify-center sm:mt-5">
              <span className={`${chipBase} border-[#f8b76a]/40 bg-[#1a1209]/80 text-[#f8b76a]`}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#f8b76a]"></span>
                ANDROID · TESTING PENDING
              </span>
            </div>
          </div>
        </div>

        {/* connecting panel floats under the scene */}
        <div className="relative mx-auto mt-8 max-w-2xl">
          <div className="absolute -top-12 left-1/2 hidden h-10 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[#35e1cb]/50 to-transparent sm:block"></div>
          <div className="rounded-2xl border border-white/10 bg-[#0a0f18]/85 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div>
                <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-[#35e1cb]">
                  <Wifi size={13} /> LOCAL-FIRST
                </p>
                <p className="mt-1.5 text-sm font-medium text-[#dbe6f2]">
                  Runs on your hardware
                </p>
              </div>
              <div className="hidden sm:block">
                <div className="mx-auto h-px w-10 bg-white/10"></div>
              </div>
              <div>
                <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-[#63beea]">
                  <ShieldCheck size={13} /> ONE VAULT
                </p>
                <p className="mt-1.5 text-sm font-medium text-[#dbe6f2]">
                  Model-independent personal memory
                </p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] tracking-wide text-[#6d8299]">
            {t('landDevicesBadge')}
          </p>
        </div>
      </div>

      {showCards ? (
        <div className="relative mx-auto mt-10 grid max-w-4xl gap-5 px-5 sm:grid-cols-2 sm:px-8">
          {[
            {
              to: '/unoone/power',
              icon: <Laptop size={18} />,
              name: t('landDevicesPower'),
              desc: t('landDevicesPowerDesc'),
            },
            {
              to: '/unoone/mobile',
              icon: <Smartphone size={18} />,
              name: t('landDevicesMobile'),
              desc: t('landDevicesMobileDesc'),
            },
          ].map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-2xl border border-white/10 bg-white/[0.025] p-6 transition-colors hover:border-[#35e1cb]/40 hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#101a24] text-[#35e1cb]">
                  {card.icon}
                </span>
                <h3 className="text-lg font-semibold">{card.name}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#b4c8de]">{card.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#35e1cb]">
                {t('landDevicesExplore')}
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default UnoOneDevices;