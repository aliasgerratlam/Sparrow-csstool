import { Seo } from '@/components/seo/Seo'
import { LegalPage, LegalSection, LegalList } from './LegalPage'

const CONTACT_EMAIL = 'hello@trysparrowcss.com'
const UPDATED = 'July 18, 2026'

/* Privacy Policy (/privacy). Static content describing how Sparrow handles
   data. Reflects the actual stack: Clerk (authentication), Supabase (annotation
   + collaboration data), Kelviq (subscription billing, Merchant of Record), and
   browser localStorage. Keep this in sync with the app's real data practices —
   if a new processor is added, list it under "Third-party services". */
export function PrivacyPolicyPage() {
  return (
    <>
      <Seo
        title="Privacy Policy — Sparrow"
        description="How Sparrow collects, uses, and protects your data across our website and browser extension."
        path="/privacy"
      />
      <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <p>
          This Privacy Policy explains what information Sparrow (“Sparrow”, “we”,
          “us”) collects when you use our website, browser extension, and related
          services (together, the “Service”), how we use it, and the choices you
          have. By using the Service you agree to the practices described here.
        </p>
      }
    >
      <LegalSection heading="1. Information we collect">
        <p>We collect the following categories of information:</p>
        <LegalList
          items={[
            <>
              <strong>Account information.</strong> When you sign in, our
              authentication provider (Clerk) processes your name, email address,
              and — if you choose Google sign-in — the basic profile details that
              Google shares. We store a display name and a plan identifier.
            </>,
            <>
              <strong>Annotations &amp; collaboration data.</strong> Comments,
              annotation pins, review status, and the page URL they are attached
              to are saved so you can review and share them. When you open a
              collaboration link, presence and cursor data are exchanged in real
              time with others in that session.
            </>,
            <>
              <strong>Subscription &amp; billing information.</strong> Paid plans
              are processed by Kelviq, our Merchant of Record. Kelviq handles your
              payment details directly — we never receive or store full card
              numbers. We receive your plan, billing cycle, and subscription
              status.
            </>,
            <>
              <strong>Local data.</strong> Your annotations, session identifiers,
              and usage limits are cached in your browser’s local storage so the
              tool works without an account and survives page reloads.
            </>,
            <>
              <strong>Technical data.</strong> Standard information such as
              browser type and interactions needed to operate and secure the
              Service.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. How we use your information">
        <p>We use the information we collect to:</p>
        <LegalList
          items={[
            'Provide, maintain, and improve the Service;',
            'Authenticate you and keep your account secure;',
            'Store and sync your annotations and collaboration sessions;',
            'Process subscriptions and enforce plan limits;',
            'Respond to your requests and provide support;',
            'Detect, prevent, and address abuse or technical issues.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Third-party services">
        <p>
          We rely on the following processors, each of whom handles data on our
          behalf under their own privacy terms:
        </p>
        <LegalList
          items={[
            <>
              <strong>Clerk</strong> — authentication and account management.
            </>,
            <>
              <strong>Supabase</strong> — database and real-time collaboration
              for annotations and sessions.
            </>,
            <>
              <strong>Kelviq</strong> — subscription billing as Merchant of
              Record, including payment processing and tax.
            </>,
            <>
              <strong>Google Fonts</strong> — optional web fonts loaded on demand
              when you use the font tools.
            </>,
          ]}
        />
        <p>
          We do not sell your personal information, and we do not share it with
          third parties for their own marketing.
        </p>
      </LegalSection>

      <LegalSection heading="4. Cookies & local storage">
        <p>
          The Service uses cookies and browser local storage to keep you signed
          in, remember your preferences, cache your annotations, and enforce
          usage limits. You can clear this data through your browser at any time,
          though doing so will sign you out and remove locally cached
          annotations.
        </p>
      </LegalSection>

      <LegalSection heading="5. Data retention">
        <p>
          We keep account information for as long as your account is active.
          Collaboration sessions expire and are automatically deleted after three
          days; annotations attached to a page persist until you delete them or
          request deletion of your account. Billing records are retained by our
          Merchant of Record as required for tax and accounting purposes.
        </p>
      </LegalSection>

      <LegalSection heading="6. Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct,
          export, or delete your personal information, and to object to or
          restrict certain processing. To exercise these rights, contact us using
          the details below. You can also delete individual annotations directly
          in the app.
        </p>
      </LegalSection>

      <LegalSection heading="7. Security">
        <p>
          We use reasonable technical and organizational measures to protect your
          information. No method of transmission or storage is completely secure,
          so we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="8. Children’s privacy">
        <p>
          The Service is not directed to children under 13, and we do not
          knowingly collect personal information from them.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we will
          revise the “Last updated” date above. Material changes will be
          communicated through the Service.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact us">
        <p>
          If you have questions about this Privacy Policy or your data, contact us
          at{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium text-sparrow-blue underline-offset-2 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
    </>
  )
}
