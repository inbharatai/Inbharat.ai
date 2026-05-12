import React from 'react';
import { Link } from 'react-router-dom';
import StaticLayout from './_StaticLayout';
import { SITE } from '../seo.config';

const Terms: React.FC = () => (
  <StaticLayout
    eyebrow="Legal"
    title="Terms of Service"
    description="The basic terms covering use of InBharat AI — the website and the InBharat AI console."
    updated="2026-05-12"
  >
    <section>
      <h2 className="text-xl font-bold text-white">1. Acceptance</h2>
      <p>
        By using <code>{SITE.url}</code> or the InBharat AI console you agree to these terms. If
        you don&apos;t agree, please don&apos;t use the product.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">2. What InBharat AI is — and isn&apos;t</h2>
      <p>
        InBharat AI is software that generates text, audio, and other content using AI models. AI
        output can be wrong, incomplete, or out of date. Treat it as a starting point, not a final
        answer — especially for legal, medical, financial, or safety-critical decisions.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">3. Your account</h2>
      <p>
        You&apos;re responsible for keeping your sign-in credentials safe and for activity that
        happens on your account. Don&apos;t share your account with someone else. You must be old
        enough under the laws of your country to enter into this agreement.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">4. Acceptable use</h2>
      <p>You agree not to use InBharat AI to:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Generate, distribute, or facilitate illegal content (including child sexual abuse material, real-world harm planning, or anything criminal under Indian law).</li>
        <li>Impersonate other people or organisations in a way that could deceive others.</li>
        <li>Spam, scrape, or attempt to extract bulk data from the product.</li>
        <li>Reverse-engineer, attack, probe, or otherwise compromise our infrastructure.</li>
        <li>Re-sell the service or expose it through your own paid product without our written permission.</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these rules, with or without notice.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">5. Content</h2>
      <p>
        You keep ownership of the inputs you send to InBharat AI. You&apos;re responsible for what
        you submit and for any consequences of using the output. We don&apos;t train models on your
        inputs or outputs.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">6. Availability</h2>
      <p>
        We work to keep the service up, but we don&apos;t guarantee continuous availability,
        backwards compatibility of features, or any particular response speed. We may add, change,
        or remove features.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">7. Disclaimers</h2>
      <p>
        InBharat AI is provided &ldquo;as is&rdquo;, without warranties of any kind. To the maximum
        extent permitted by law, we&apos;re not liable for indirect, incidental, special,
        consequential, or punitive damages, or for loss of data, revenue, or profits.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">8. Privacy</h2>
      <p>
        How we handle your data is covered in our{' '}
        <Link to="/privacy" className="text-[#f59f4f] underline-offset-4 hover:underline">Privacy Policy</Link>.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">9. Governing law</h2>
      <p>
        These terms are governed by the laws of India. Disputes will be resolved in the courts of
        India.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white">10. Changes</h2>
      <p>
        If we change these terms, we&apos;ll update this page and adjust the date at the top.
        Continued use after a change means you accept the updated terms. Questions? Email{' '}
        <a className="text-[#f59f4f] underline-offset-4 hover:underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </section>
  </StaticLayout>
);

export default Terms;
