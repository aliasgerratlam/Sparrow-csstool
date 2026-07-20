import { Seo } from '@/components/seo/Seo'
import { LegalPage, LegalSection, LegalList } from './LegalPage'

const CONTACT_EMAIL = 'hello@trysparrowcss.com'
const UPDATED = 'July 18, 2026'

/* Terms & Conditions (/terms). Static content governing use of Sparrow. Billing
   language reflects the Kelviq Merchant-of-Record model (recurring Free/Pro/Max
   plans, monthly + yearly) and the self-serve customer portal. */
export function TermsPage() {
  return (
    <>
      <Seo
        title="Terms & Conditions — Sparrow"
        description="The terms governing your use of Sparrow's website, browser extension, and related services."
        path="/terms"
      />
      <LegalPage
      title="Terms & Conditions"
      updated={UPDATED}
      intro={
        <p>
          These Terms &amp; Conditions (“Terms”) govern your access to and use of
          Sparrow’s website, browser extension, and related services (the
          “Service”). By using the Service, you agree to these Terms. If you do
          not agree, do not use the Service.
        </p>
      }
    >
      <LegalSection heading="1. Using the Service">
        <p>
          Sparrow is a browser-based tool for inspecting CSS, annotating web
          pages, and reviewing that feedback with others. You may use the Service
          only in compliance with these Terms and all applicable laws. You are
          responsible for the activity that occurs under your account.
        </p>
      </LegalSection>

      <LegalSection heading="2. Accounts">
        <p>
          Some features require an account, which is created and secured through
          our authentication provider. You must provide accurate information and
          keep your credentials confidential. You are responsible for all
          activity under your account and must notify us of any unauthorized use.
        </p>
      </LegalSection>

      <LegalSection heading="3. Subscriptions & billing">
        <p>
          Sparrow offers Free, Pro, and Max plans on monthly and yearly billing
          cycles. Paid subscriptions are sold and processed by Kelviq, our
          Merchant of Record, who is the seller of record for your purchase.
        </p>
        <LegalList
          items={[
            'Paid plans renew automatically at the end of each billing cycle until cancelled.',
            'You can cancel, upgrade, downgrade, or manage your subscription at any time through the customer portal in your account.',
            'When you cancel, your plan remains active until the end of the current billing period and does not renew after that.',
            'Prices, taxes, and currency are shown at checkout. Except where required by law, payments are non-refundable.',
            'Feature access reflects your current plan and updates automatically on renewal, cancellation, or failed payment.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            'Use the Service to violate any law or infringe anyone’s rights;',
            'Attempt to disrupt, reverse-engineer, or gain unauthorized access to the Service or its systems;',
            'Upload or share content that is unlawful, harmful, or infringing;',
            'Resell or misrepresent the Service, or circumvent plan limits or access controls.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Your content">
        <p>
          You retain ownership of the annotations, comments, and other content
          you create with the Service (“Your Content”). You grant us a limited
          license to store, display, and process Your Content solely to operate
          and provide the Service to you and those you share it with. You are
          responsible for Your Content and for having the rights to inspect and
          annotate the pages you use the Service on.
        </p>
      </LegalSection>

      <LegalSection heading="6. Intellectual property">
        <p>
          The Service, including its software, design, and branding, is owned by
          Sparrow and protected by intellectual-property laws. These Terms do not
          grant you any right to our trademarks or to use the Service other than
          as permitted here.
        </p>
      </LegalSection>

      <LegalSection heading="7. Third-party services">
        <p>
          The Service integrates with third-party providers (including for
          authentication, data storage, billing, and fonts). Your use of those
          integrations may also be subject to the providers’ own terms, and we
          are not responsible for third-party services.
        </p>
      </LegalSection>

      <LegalSection heading="8. Disclaimers">
        <p>
          The Service is provided “as is” and “as available,” without warranties
          of any kind, whether express or implied, including fitness for a
          particular purpose and non-infringement. We do not warrant that the
          Service will be uninterrupted, error-free, or that inspection results
          are accurate for every page.
        </p>
      </LegalSection>

      <LegalSection heading="9. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Sparrow will not be liable for
          any indirect, incidental, special, consequential, or punitive damages,
          or for any loss of data, revenue, or profits, arising from your use of
          the Service. Our total liability for any claim will not exceed the
          amount you paid us in the twelve months before the claim.
        </p>
      </LegalSection>

      <LegalSection heading="10. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate
          your access if you violate these Terms or if we discontinue the
          Service. Provisions that by their nature should survive termination
          (such as intellectual property, disclaimers, and limitation of
          liability) will continue to apply.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to these Terms">
        <p>
          We may update these Terms from time to time. When we do, we will revise
          the “Last updated” date above. Your continued use of the Service after
          changes take effect constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact us">
        <p>
          Questions about these Terms? Contact us at{' '}
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
