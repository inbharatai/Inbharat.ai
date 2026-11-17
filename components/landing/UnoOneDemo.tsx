import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Play, ArrowUpRight } from 'lucide-react';
import { UNOONE_DEMO } from '../../content/unooneLanding';
import transcript from './unooneDemoTranscript.json';

const timestamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function UnoOneDemo({ watchPage = false }: { watchPage?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<(() => void) | null>(null);
  useEffect(() => () => { pendingSeek.current?.(); }, []);
  const seek = (event: React.MouseEvent<HTMLAnchorElement>, seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    event.preventDefault();
    // No media request on mount. Enter/click on a chapter explicitly loads it.
    // Retire a previous pending seek so rapid keyboard choices don't race.
    pendingSeek.current?.();
    const position = () => {
      video.currentTime = Number.isFinite(video.duration) ? Math.min(seconds, video.duration) : seconds;
      video.focus();
      pendingSeek.current?.();
    };
    if (video.readyState >= 1) position();
    else {
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', position);
        video.removeEventListener('error', cleanup);
        pendingSeek.current = null;
      };
      pendingSeek.current = cleanup;
      video.addEventListener('loadedmetadata', position, { once: true });
      video.addEventListener('error', cleanup, { once: true });
      video.load();
    }
  };

  return (
    <section id="unoone-demo" className="unoone-demo" aria-labelledby="unoone-demo-title">
      <div className="unoone-demo-label">
        <span><Play size={13} aria-hidden="true" /> PRODUCT WALKTHROUGH</span>
        <span>{UNOONE_DEMO.durationLabel}</span>
      </div>
      <div className="unoone-video-frame">
        <video ref={videoRef} controls preload="none" playsInline poster={UNOONE_DEMO.poster} width={1920} height={1080} tabIndex={0} aria-label={UNOONE_DEMO.title} aria-describedby="unoone-demo-context">
          <source src={UNOONE_DEMO.video} type="video/mp4" />
          <track kind="captions" src={UNOONE_DEMO.captions} srcLang="en" label="English" default />
          Your browser does not support this player. <a href={UNOONE_DEMO.video}>Open the UnoOne product walkthrough</a>.
        </video>
      </div>
      <div className="unoone-demo-caption">
        <h2 id="unoone-demo-title">Explore the UnoOne workspace.</h2>
        <p id="unoone-demo-context">{UNOONE_DEMO.visibleContext}</p>
      </div>
      {!watchPage && <Link className="unoone-text-link" to="/unoone/demo">Watch page, chapters & transcript <ArrowUpRight size={14} aria-hidden="true" /></Link>}
      <details className="unoone-demo-details" open={watchPage || undefined}>
        <summary>Chapters, transcript &amp; viewing context <ArrowUpRight size={16} aria-hidden="true" /></summary>
        <p className="unoone-demo-note">{UNOONE_DEMO.description}</p>
        <nav aria-label="Demo chapters" className="unoone-chapters">
          {UNOONE_DEMO.chapters.map(chapter => (
            <a key={chapter.seconds} href={`${UNOONE_DEMO.video}#t=${chapter.seconds}`} onClick={event => seek(event, chapter.seconds)}>
              <time>{timestamp(chapter.seconds)}</time>{chapter.label}
            </a>
          ))}
        </nav>
        <p className="unoone-demo-note">The film includes internal hardware measurements and future plans. Its 27B example is not a general hardware recommendation; later engineering evidence records critical resource pressure and unload before a user turn. The Android captures show development behavior; the inspected release configuration disables cross-app Accessibility automation and Owl planning. Phone–computer memory sync is still in development.</p>
        <p className="unoone-demo-note">Choose a chapter to seek, then use the native player to play or pause. Keyboard users can activate chapter links with Enter and continue in the focused player. Without JavaScript, chapter links open the media at the requested time.</p>
        <Link className="unoone-text-link" to="/status">Compare with current evidence & availability <ArrowUpRight size={14} aria-hidden="true" /></Link>
        <a className="unoone-text-link" href={UNOONE_DEMO.video}>Open the full walkthrough <ArrowUpRight size={14} aria-hidden="true" /></a>
        <h3>English transcript</h3>
        <p className="unoone-demo-note">English captions extracted from the supplied recording; read alongside the current status above.</p>
        <div className="unoone-transcript" role="region" aria-label="English walkthrough transcript" tabIndex={watchPage ? undefined : 0}>
          {transcript.map(cue => <p key={cue.time}><time>{cue.time.slice(0, 5)}</time>{cue.text}</p>)}
        </div>
        <a className="unoone-text-link" href={UNOONE_DEMO.captions}>English caption file (VTT) <ArrowUpRight size={14} aria-hidden="true" /></a>
      </details>
    </section>
  );
}
