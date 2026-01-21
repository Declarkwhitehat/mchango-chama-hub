import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PrivacyPolicy = () => {
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
            <CardTitle className="text-3xl">Privacy Policy</CardTitle>
            <CardDescription>
              Last Updated: {new Date().toLocaleDateString()} | Version 1.0
            </CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Introduction</h2>
              <p className="text-muted-foreground">
                This Privacy Policy describes how we collect, use, store, and protect your personal information 
                when you use our platform. We are committed to protecting your privacy and handling your data 
                in an open and transparent manner.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Information We Collect</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.1 Personal Information</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Account Information:</strong> Full name, email address, phone number, ID number</li>
                <li><strong>KYC Documents:</strong> Government-issued ID (front and back photos)</li>
                <li><strong>Payment Information:</strong> M-Pesa phone number, bank account details (if provided)</li>
                <li><strong>Profile Data:</strong> Profile picture, bio, and other optional information</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.2 Transaction Data</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Payment amounts, dates, and transaction references</li>
                <li>M-Pesa receipt numbers and transaction history</li>
                <li>Contribution records in Chamas and Organizations</li>
                <li>Donation history in Mchango campaigns</li>
                <li>Withdrawal requests and payout records</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.3 Technical Data</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>IP addresses and device information</li>
                <li>Browser type and version</li>
                <li>Login timestamps and session data</li>
                <li>Usage patterns and feature interactions</li>
                <li>Error logs and diagnostic information</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.4 Communication Data</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>SMS messages sent for OTP verification and transaction confirmations</li>
                <li>Email correspondence and notifications</li>
                <li>Support ticket conversations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
              <p className="text-muted-foreground">We use your personal information for:</p>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.1 Service Delivery</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Creating and managing your account</li>
                <li>Processing transactions and payments via M-Pesa</li>
                <li>Facilitating Chama rotations, Mchango fundraising, and Organization donations</li>
                <li>Sending transaction confirmations and receipts via SMS and email</li>
                <li>Processing withdrawal requests and payouts</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.2 Security and Fraud Prevention</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Verifying your identity through KYC procedures</li>
                <li>Detecting and preventing fraud, money laundering, and unauthorized access</li>
                <li>Monitoring for suspicious account activity</li>
                <li>Logging IP addresses for security audits</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.3 Platform Improvement</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Analyzing usage patterns to improve features and user experience</li>
                <li>Conducting research and analytics using aggregated, anonymized data</li>
                <li>Developing new features and services</li>
                <li>Troubleshooting technical issues</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.4 Communication</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Sending important account notifications and updates</li>
                <li>Providing customer support and responding to inquiries</li>
                <li>Sending marketing communications (with your consent, opt-out available)</li>
                <li>Notifying you about changes to our terms or privacy policy</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">3.5 Legal Compliance</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Complying with legal obligations and regulatory requirements</li>
                <li>Responding to law enforcement requests and court orders</li>
                <li>Enforcing our Terms and Conditions</li>
                <li>Protecting our rights and the rights of our users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. How We Share Your Information</h2>
              <p className="text-muted-foreground">We may share your personal information with:</p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.1 Service Providers</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Payment Processors:</strong> Safaricom (M-Pesa) for payment processing</li>
                <li><strong>SMS Providers:</strong> Celcom and other SMS gateways for sending OTP and notifications</li>
                <li><strong>Cloud Infrastructure:</strong> Supabase for data storage and authentication</li>
                <li><strong>Analytics Tools:</strong> For aggregated, anonymized usage statistics</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.2 Legal Requirements</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Law enforcement agencies and government authorities when required by law</li>
                <li>Financial regulators for compliance with anti-money laundering (AML) regulations</li>
                <li>Courts and tribunals in response to legal proceedings</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.3 Business Transfers</h3>
              <p className="text-muted-foreground">
                In the event of a merger, acquisition, or sale of assets, your information may be transferred 
                to the acquiring entity. We will notify you of such changes.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.4 With Your Consent</h3>
              <p className="text-muted-foreground">
                We may share information with third parties when you explicitly consent to such sharing, 
                such as when you authorize integration with external services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Security</h2>
              <p className="text-muted-foreground">
                We implement industry-standard security measures to protect your personal information:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Encryption:</strong> All data is encrypted in transit (HTTPS/TLS) and at rest</li>
                <li><strong>Access Controls:</strong> Strict role-based access to personal data</li>
                <li><strong>Authentication:</strong> Secure password hashing and OTP verification</li>
                <li><strong>Secure Storage:</strong> ID documents stored in encrypted cloud storage buckets</li>
                <li><strong>Regular Audits:</strong> Security assessments and vulnerability scanning</li>
                <li><strong>Monitoring:</strong> 24/7 system monitoring for suspicious activity</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                <strong>Note:</strong> While we strive to protect your data, no method of transmission over 
                the internet or electronic storage is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Data Retention</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Account Data:</strong> Retained for the duration of your account plus 7 years for compliance</li>
                <li><strong>Transaction Records:</strong> Retained for 7 years as required by financial regulations</li>
                <li><strong>KYC Documents:</strong> Retained for 7 years after account closure for regulatory compliance</li>
                <li><strong>Communication Logs:</strong> Retained for 2 years for support and dispute resolution</li>
                <li><strong>Technical Logs:</strong> Retained for 90 days for security and troubleshooting</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                After retention periods expire, data is securely deleted or anonymized.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Your Privacy Rights</h2>
              <p className="text-muted-foreground">You have the following rights regarding your personal data:</p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.1 Access</h3>
              <p className="text-muted-foreground">
                You can request a copy of all personal data we hold about you by contacting support.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.2 Correction</h3>
              <p className="text-muted-foreground">
                You can update your profile information at any time through your account settings. For corrections 
                to KYC data, please contact support.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.3 Deletion</h3>
              <p className="text-muted-foreground">
                You can request account deletion. Note that we must retain certain data for legal and regulatory 
                compliance even after account closure.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.4 Portability</h3>
              <p className="text-muted-foreground">
                You can request a machine-readable export of your personal data.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.5 Objection and Restriction</h3>
              <p className="text-muted-foreground">
                You can object to processing of your data for marketing purposes or request restriction of 
                processing in certain circumstances.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">7.6 Withdraw Consent</h3>
              <p className="text-muted-foreground">
                Where processing is based on consent, you can withdraw consent at any time (this does not 
                affect the lawfulness of prior processing).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Cookies and Tracking</h2>
              <p className="text-muted-foreground">We use the following types of cookies:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Essential Cookies:</strong> Required for authentication and core platform functionality</li>
                <li><strong>Performance Cookies:</strong> Help us understand how you use the platform (anonymized)</li>
                <li><strong>Functional Cookies:</strong> Remember your preferences and settings</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                You can control cookies through your browser settings, but disabling essential cookies may 
                affect platform functionality.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Children's Privacy</h2>
              <p className="text-muted-foreground">
                Our services are not intended for individuals under 18 years of age. We do not knowingly collect 
                personal information from minors. If we discover that we have inadvertently collected data from 
                a minor, we will promptly delete it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">10. International Data Transfers</h2>
              <p className="text-muted-foreground">
                Your data may be processed and stored in servers located in different countries, including but 
                not limited to Kenya and other jurisdictions where our service providers operate. We ensure that 
                adequate safeguards are in place for international transfers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">11. Third-Party Links</h2>
              <p className="text-muted-foreground">
                Our platform may contain links to third-party websites (e.g., WhatsApp groups, external payment 
                pages). We are not responsible for the privacy practices of these third parties. Please review 
                their privacy policies before providing personal information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">12. Changes to This Privacy Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time to reflect changes in our practices or legal 
                requirements. We will notify you of significant changes via email or platform notification. 
                Continued use of our services after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">13. Data Protection Officer</h2>
              <p className="text-muted-foreground">
                For questions, concerns, or to exercise your privacy rights, please contact our Data Protection Officer:
              </p>
              <div className="mt-3 text-muted-foreground">
                <p>Email: privacy@platform.com</p>
                <p>Phone: +254 XXX XXX XXX</p>
                <p>Address: Nairobi, Kenya</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">14. Complaints</h2>
              <p className="text-muted-foreground">
                If you believe your privacy rights have been violated, you have the right to lodge a complaint 
                with the Office of the Data Protection Commissioner of Kenya or other relevant data protection 
                authority in your jurisdiction.
              </p>
            </section>

            <section className="border-t pt-6 mt-8">
              <p className="text-sm text-muted-foreground">
                <strong>Acknowledgment:</strong> By using our platform, you acknowledge that you have read and 
                understood this Privacy Policy and consent to the collection, use, and sharing of your personal 
                information as described herein.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PrivacyPolicy;