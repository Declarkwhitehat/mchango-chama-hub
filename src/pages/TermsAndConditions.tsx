import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TermsAndConditions = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Terms and Conditions</CardTitle>
            <CardDescription>
              Last Updated: {formatDate(new Date())} | Version 1.0
            </CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Introduction</h2>
              <p className="text-muted-foreground">
                Welcome to our platform. By accessing or using our services (Chama, Mchango, and Organizations), 
                you agree to be bound by these Terms and Conditions. If you disagree with any part of these terms, 
                you may not access our services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Eligibility</h2>
              <p className="text-muted-foreground">
                You must be at least 18 years old to use our services. By registering, you represent and warrant 
                that you meet this age requirement. Minors require explicit guardian consent and supervision.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Account Registration and Security</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>You must provide accurate, complete, and current information during registration</li>
                <li>You are responsible for maintaining the confidentiality of your account credentials</li>
                <li>You agree to immediately notify us of any unauthorized access to your account</li>
                <li>You are fully responsible for all activities that occur under your account</li>
                <li>We reserve the right to suspend or terminate accounts that violate these terms</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. KYC (Know Your Customer) Requirements</h2>
              <p className="text-muted-foreground">
                To comply with financial regulations and ensure platform security:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>You must complete identity verification by submitting valid government-issued ID</li>
                <li>We reserve the right to request additional verification documents at any time</li>
                <li>Accounts will remain restricted until KYC verification is approved</li>
                <li>We may reject KYC submissions that do not meet our verification standards</li>
                <li>False or fraudulent information will result in immediate account termination</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Platform Services</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">5.1 Chama (Rotating Savings)</h3>
              <p className="text-muted-foreground">
                Our Chama service facilitates rotating savings and credit associations. Members contribute regularly 
                and receive payouts according to the established schedule. The platform acts solely as a facilitator.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">5.2 Mchango (Fundraising)</h3>
              <p className="text-muted-foreground">
                Mchango enables users to create and contribute to fundraising campaigns. Campaign creators are 
                responsible for the accuracy of their campaigns and the proper use of funds received.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">5.3 Organizations</h3>
              <p className="text-muted-foreground">
                Organizations (NGOs, Churches, Schools, etc.) can register on our platform to receive donations 
                from supporters. Organization administrators are responsible for proper use of funds.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Financial Terms</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Transaction Fees:</strong> Platform charges a 5% commission on transactions (configurable by group)</li>
                <li><strong>Withdrawal Fees:</strong> Additional fees may apply for withdrawals and fund transfers</li>
                <li><strong>Payment Processing:</strong> M-Pesa and other payment processors may charge separate fees</li>
                <li><strong>Non-Refundable Fees:</strong> All platform transaction fees are non-refundable</li>
                <li><strong>Currency:</strong> All transactions are conducted in Kenyan Shillings (KES)</li>
                <li><strong>Fee Changes:</strong> We reserve the right to modify fees with 30 days' advance notice</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. M-Pesa Integration</h2>
              <p className="text-muted-foreground">
                Our platform integrates with M-Pesa for payments. By using M-Pesa services:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>You agree to Safaricom's M-Pesa terms and conditions</li>
                <li>You acknowledge that M-Pesa transaction failures are outside our control</li>
                <li>You understand that M-Pesa charges separate transaction fees</li>
                <li>You are responsible for ensuring sufficient M-Pesa balance for transactions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Withdrawals and Payouts</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Withdrawal requests are subject to verification and approval</li>
                <li>Processing time for withdrawals is typically 1-5 business days</li>
                <li>We reserve the right to delay or deny withdrawals if fraud is suspected</li>
                <li>Minimum withdrawal amounts may apply</li>
                <li>You must have a verified payment method to receive withdrawals</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Prohibited Activities</h2>
              <p className="text-muted-foreground">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Use the platform for illegal activities, money laundering, or fraud</li>
                <li>Create false or misleading fundraising campaigns</li>
                <li>Impersonate others or provide false identity information</li>
                <li>Attempt to gain unauthorized access to the platform or other users' accounts</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Use automated systems or bots to access the platform</li>
                <li>Engage in activities that harm the platform or other users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">10. Limitation of Liability</h2>
              <p className="text-muted-foreground font-semibold">
                THE PLATFORM IS PROVIDED "AS-IS" WITHOUT WARRANTIES OF ANY KIND.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-3">
                <li>We are not a licensed financial institution or investment advisor</li>
                <li>We do not guarantee transaction success or fund security</li>
                <li>We are not liable for disputes between users, Chama members, or group participants</li>
                <li>We are not responsible for M-Pesa failures, network issues, or third-party service disruptions</li>
                <li>Our maximum liability is limited to fees paid by you in the last 12 months</li>
                <li>We are not liable for lost profits, data loss, or indirect damages</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">11. Indemnification</h2>
              <p className="text-muted-foreground">
                You agree to indemnify, defend, and hold harmless the platform, its officers, directors, employees, 
                and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising 
                from your use of the platform, violation of these terms, or infringement of any third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">12. Account Suspension and Termination</h2>
              <p className="text-muted-foreground">We reserve the right to:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Suspend accounts pending investigation of suspicious activity</li>
                <li>Freeze funds if fraud, money laundering, or illegal activity is suspected</li>
                <li>Terminate accounts that violate these terms without prior notice</li>
                <li>Refuse service to anyone at our sole discretion</li>
                <li>Report illegal activities to law enforcement authorities</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">13. Data Rights and Privacy</h2>
              <p className="text-muted-foreground">
                By using our services, you grant us the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Collect, store, and process your personal data as described in our Privacy Policy</li>
                <li>Use aggregate and anonymized data for analytics and platform improvements</li>
                <li>Share data with payment processors, SMS providers, and other service providers</li>
                <li>Disclose information to regulators and law enforcement when required by law</li>
                <li>Use your content and testimonials for marketing purposes (with your consent)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">14. Intellectual Property</h2>
              <p className="text-muted-foreground">
                All platform content, features, functionality, code, and design are owned by us and protected by 
                copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, 
                or reverse engineer any part of the platform without explicit written permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">15. Dispute Resolution</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Arbitration:</strong> All disputes shall be resolved through binding arbitration in Nairobi, Kenya</li>
                <li><strong>Class Action Waiver:</strong> You waive any right to participate in class action lawsuits</li>
                <li><strong>Jurisdiction:</strong> These terms are governed by the laws of the Republic of Kenya</li>
                <li><strong>Venue:</strong> Any legal action must be brought in the courts of Nairobi, Kenya</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">16. Service Modifications</h2>
              <p className="text-muted-foreground">We reserve the right to:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Modify, suspend, or discontinue any service or feature at any time</li>
                <li>Update these Terms and Conditions (users will be notified via email)</li>
                <li>Change fee structures with 30 days' advance notice</li>
                <li>Implement new features or remove existing ones without liability</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">17. No Investment Advice</h2>
              <p className="text-muted-foreground">
                The platform does not provide investment, financial, or legal advice. Any information provided is 
                for general educational purposes only. You should consult qualified professionals before making 
                financial decisions. Returns and profits are not guaranteed.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">18. Communication</h2>
              <p className="text-muted-foreground">
                By using our services, you consent to receive communications from us via:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Email notifications about your account and transactions</li>
                <li>SMS messages for transaction confirmations and OTP verification</li>
                <li>In-app notifications about platform updates and features</li>
                <li>Marketing communications (you may opt-out at any time)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">19. Force Majeure</h2>
              <p className="text-muted-foreground">
                We shall not be liable for any failure or delay in performance due to circumstances beyond our 
                reasonable control, including but not limited to acts of God, war, terrorism, riots, embargoes, 
                acts of civil or military authorities, fires, floods, accidents, network infrastructure failures, 
                strikes, or shortages of transportation, facilities, fuel, energy, labor, or materials.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">20. Severability</h2>
              <p className="text-muted-foreground">
                If any provision of these Terms is found to be unenforceable or invalid, that provision shall be 
                limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain 
                in full force and effect.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">21. Contact Information</h2>
              <p className="text-muted-foreground">
                For questions about these Terms and Conditions, please contact us at:
              </p>
              <div className="mt-3 text-muted-foreground">
                <p>Email: legal@platform.com</p>
                <p>Phone: +254 XXX XXX XXX</p>
                <p>Address: Nairobi, Kenya</p>
              </div>
            </section>

            <section className="border-t pt-6 mt-8">
              <p className="text-sm text-muted-foreground">
                <strong>Acknowledgment:</strong> By creating an account and using our services, you acknowledge 
                that you have read, understood, and agree to be bound by these Terms and Conditions.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TermsAndConditions;