import { useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';

/** A portfolio index, deliberately not a dependency or runtime architecture. */
export function SystemMap() {
  const reduced = useReducedMotion();
  const { t } = useTranslation();
  return (
    <figure className="field-map" data-static={Boolean(reduced)}>
      <figcaption><span className="field-kicker">01 / Portfolio relationships</span><h3>One field. Independent systems.</h3></figcaption>
      <div className="field-map-body">
        <svg className="field-map-lines" viewBox="0 0 600 640" preserveAspectRatio="none" aria-hidden="true">
          <path className="field-map-base" d="M300 0V590 M300 82H40 M300 82H560 M300 230H40 M300 230H560 M300 390H40 M300 390H560 M300 550H40 M300 550H560" />
          <path className="field-map-signal" d="M300 0V590 M300 82H40 M300 82H560 M300 230H40 M300 230H560 M300 390H40 M300 390H560 M300 550H40 M300 550H560" />
        </svg>
        <div className="field-map-root">InBharat AI <span>Research + product portfolio</span></div>
        <div className="field-map-nodes">
          <a href="https://silt.inbharat.ai"><small>FOUNDATIONAL / 01</small><strong>SILT</strong><span>Trust-gated learning</span></a>
          <a href="https://github.com/inbharatai/PAI.V2" target="_blank" rel="noopener noreferrer"><small>FOUNDATIONAL / 02</small><strong>Pocket AI</strong><span>Portable private state</span></a>
          {[
            ['landBucketCore', 'InBharat AI'], ['landBucketAgentOps', 'JAK · Arcade · Phoring'],
            ['landBucketConsumer', 'Companions + culture'], ['landBucketEduCareer', 'Learning + pathways'],
            ['landBucketHealth', 'Field + personal health'], ['landBucketGrowth', 'SocialFlow'],
          ].map(([key, detail]) => <a href="#products" key={key}><strong>{t(key)}</strong><span>{detail}</span></a>)}
        </div>
      </div>
      <p className="field-map-note">Connections group areas of work. They do not imply that every product runs on SILT or Pocket AI.</p>
    </figure>
  );
}

export function JakDiagram() {
  return <figure className="field-jak-diagram">
    <figcaption><span className="field-kicker">JAK / Evidence flow</span><h3>From source to approved artifact.</h3><p>Conceptual workflow · not live telemetry</p></figcaption>
    <ol className="field-jak-flow">
      <li><span>01</span><div><strong>Sources</strong><small>Context · documents · code</small></div></li>
      <li><span>02</span><div><strong>Ingest → Evidence graph</strong><small>Parse + embed · nodes + edges</small></div></li>
      <li><span>03</span><div><strong>Agent work</strong><small>Entities · plans · sandboxed tools · policy</small></div></li>
      <li className="field-jak-gate"><span>04</span><div><strong>Drift detection + JAK Shield</strong><small>Compare against the spec · risk gate</small></div></li>
      <li><span>05</span><div><strong>Tamper-evident audit trail</strong><small>Review evidence before approval</small></div></li>
      <li><span>06</span><div><strong>Approved artifact</strong><small>Traceable output · retained evidence</small></div></li>
    </ol>
  </figure>;
}
