import { ArrowUpRight, Github } from 'lucide-react';
import { DEEP_TECH_PROJECTS } from '../../content/deepTech';
import { PatentBadge } from '../PatentBadge';

export function DeepTechField() {
  return <section id="deep-tech" className="field-deep relative z-10">
    <div className="field-container">
      <div className="field-section-heading">
        <p className="field-kicker">02 / Foundational Deep Tech</p>
        <h2>Original AI infrastructure,<br />not just applications.</h2>
        <p>InBharat is building foundational systems for how AI learns, where intelligence lives, how agentic systems are secured, and how local hardware can participate in advanced AI workflows.</p>
      </div>
      <div className="field-deep-grid">
        {DEEP_TECH_PROJECTS.map((project) => <article key={project.id} id={`field-${project.id}`} className="field-deep-project">
          <div className="field-project-meta"><span>{project.id === 'silt' ? 'RESEARCH / 01' : 'RESEARCH / 02'}</span><PatentBadge applicationNo={project.applicationNo} /></div>
          <h3>{project.name}</h3><p className="field-project-tagline">{project.tagline}</p>
          <p className="field-project-description">{project.description}</p>
          <figure className="field-process">
            <figcaption>Conceptual {project.id === 'silt' ? 'admission gate' : 'host-adaptive workflow'}</figcaption>
            {project.id === 'silt' ? <>
              <ol className="field-process-steps"><li><small>01 / INPUT</small><strong>Skill packet</strong></li><li><small>02 / TEST</small><strong>Evaluate</strong><span>Held-out admission checks</span></li></ol>
              <div className="field-decisions"><div><strong>Accept</strong><span>Promote with evidence</span></div><div><strong>Reject</strong><span>Do not admit the capability</span></div></div>
              <p>Human approval for high-risk domains. Audit and rollback remain part of the process.</p>
            </> : <>
              <ol className="field-process-steps field-pai-steps">{['Attach', 'Host evaluation', 'Verify', 'Launch'].map((step, i) => <li key={step}><small>0{i + 1}</small><strong>{step}</strong></li>)}</ol>
              <div className="field-device-state"><strong>State stays on the removable device</strong><span>Models · runtimes · identity · encrypted canonical state</span></div>
              <p>Alpha architecture, not production-ready. Host capability is evaluated before launch.</p>
            </>}
          </figure>
          <ul className="field-pillars">{project.pillars.slice(0, 3).map((pillar) => <li key={pillar}>{pillar}</li>)}</ul>
          <div className="field-project-actions"><a className="field-button" href={project.publicUrl}>Explore {project.shortName}<ArrowUpRight size={16} /></a><a className="field-text-link" href={project.repository} target="_blank" rel="noopener noreferrer"><Github size={16} /> GitHub</a></div>
        </article>)}
      </div>
    </div>
  </section>;
}
