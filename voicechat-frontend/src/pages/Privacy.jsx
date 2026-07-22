import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Shield } from 'lucide-react';

export default function Privacy() {
    const fadeIn = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col font-sans transition-colors duration-300 pt-20 relative overflow-hidden">
            {/* Background Decorative Glow */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary-500/10 dark:bg-primary-500/25 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-white/20 dark:border-neutral-800/50 shadow-sm transition-all duration-300">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-neutral-900 dark:text-white font-bold hover:text-primary-600 transition-colors">
                        <ChevronLeft className="w-5 h-5" /> Back to Home
                    </Link>
                </div>
            </header>

            <main className="flex-1 max-w-4xl mx-auto px-4 py-20 relative z-10">
                <motion.div 
                    initial="hidden"
                    animate="visible"
                    variants={fadeIn}
                    className="mb-16 text-center"
                >
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 dark:bg-success-900/30 text-success-650 dark:text-success-400 mb-6 mt-8">
                        <Shield className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black text-neutral-900 dark:text-white mb-4 tracking-tighter">Privacy Policy</h1>
                    <p className="text-neutral-500 dark:text-neutral-400 text-lg uppercase tracking-wider font-bold">Last Updated: 20/07/2026</p>
                </motion.div>

                <motion.div 
                    initial="hidden"
                    animate="visible"
                    variants={fadeIn}
                    className="bg-white dark:bg-neutral-900 p-8 md:p-12 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 shadow-xl space-y-10 text-neutral-700 dark:text-neutral-300"
                >
                    <p className="leading-relaxed font-medium">
                        Voclara ("Platform", "we", "our", "us") is operated by M/s DataCatalyst, a partnership firm registered under the Indian Partnership Act, 1932 ("Company"). We are committed to handling your personal data lawfully, fairly and transparently in accordance with the Digital Personal Data Protection Act, 2023 ("DPDP Act"), the Information Technology Act, 2000, the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 (collectively, "Applicable Laws").
                    </p>

                    <hr className="border-neutral-200 dark:border-neutral-800" />

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">1.</span> Information We Collect
                        </h3>
                        <p className="leading-relaxed">
                            We collect the following categories of data:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li><strong>Account information</strong> — name, email, date of birth, gender, regional language, urban/rural locality, postal address, microphone brand and model.</li>
                            <li><strong>Voice recordings, conversations and submitted Content</strong> — treated as <strong>biometric and sensitive personal data</strong>. Voice data is collected only after you have provided <strong>explicit prior consent</strong> (via the sample-recording consent checkbox and, for approved contributors, via the signed Contributor Agreement).</li>
                            <li><strong>Identity verification documents</strong> — government-issued ID, photograph and signature, collected only when required for KYC or payment compliance.</li>
                            <li><strong>Payment information</strong> — bank account or UPI details, PAN, and other information required to disburse contributor payments and comply with tax laws.</li>
                            <li><strong>Device and usage data</strong> — IP address, browser type, operating system, device identifiers, access timestamps, and interaction logs.</li>
                        </ul>
                        <p className="mt-3 leading-relaxed">
                            We do <strong>not</strong> collect phone numbers as part of standard onboarding.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">2.</span> Purpose of Collection
                        </h3>
                        <p className="leading-relaxed">
                            We collect and process the categories of data listed above for the following specific purposes:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>Creating and verifying your account, including confirming that you are at least 18 years old.</li>
                            <li><strong>Sample recording review</strong> — assessing your suitability as a contributor. Sample recordings are processed <strong>solely</strong> for approval or rejection. See Section 3.</li>
                            <li>Onboarding approved contributors and delivering the Platform's contribution workflows.</li>
                            <li>Processing paid data-collection contributions under the separate Contributor Agreement.</li>
                            <li>Processing contributor payments (net-30 from Content approval, subject to delay if the corresponding payment from the client is delayed, cancelled or paused).</li>
                            <li>Deducting tax at source ("TDS") under Section 194O of the Income-tax Act, 1961, including verifying your Permanent Account Number (PAN) with the Income Tax Department database and issuing Form 16A. If you have provided PAN, no TDS is deducted until your cumulative earnings in a financial year reach ₹5,00,000; once that threshold is crossed, 1% TDS is deducted on the full gross amount of the crossing payment and of every subsequent payment in that financial year. If PAN is not provided, 5% TDS is deducted on every payment from the first rupee under Section 206AA.</li>
                            <li>Complying with legal, tax, accounting and audit obligations.</li>
                            <li>Communicating with you about your account, contributions, payments and grievances.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">3.</span> Sample Recording — Specific Handling
                        </h3>
                        <p className="leading-relaxed">
                            The sample recording you submit during onboarding is subject to the following commitments:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>The sample is collected <strong>only to assess your suitability</strong> as a contributor.</li>
                            <li>The sample will <strong>not be sold, licensed, shared with clients, or used to train, fine-tune, evaluate or deploy any AI or machine-learning system</strong>.</li>
                            <li>The sample is retained only until the review has been completed by our review team, subject to an absolute maximum retention period of one hundred and eighty (180) days from the date of upload.</li>
                            <li>If your account is <strong>not approved</strong>, the sample recording is permanently deleted no later than one hundred and eighty (180) days from the date of upload (or sooner, at our discretion, following completion of review).</li>
                            <li>If your sample is not reviewed within 180 days of upload for any reason, it will still be deleted at the end of that period.</li>
                            <li>If your account is approved, subsequent paid contributions are governed by the Contributor Agreement and this Privacy Policy; the initial sample itself is not treated as part of any dataset and is subject to the same 180-day cap.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">4.</span> Legal Basis for Processing
                        </h3>
                        <p className="leading-relaxed">
                            We process your personal data on the following legal bases under the DPDP Act:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li><strong>Consent</strong> — for account creation, sample-recording processing, marketing communications, and processing of biometric and sensitive personal data. You may withdraw consent at any time (see Section 10).</li>
                            <li><strong>Contract performance</strong> — for processing payments, delivering the Platform and enforcing the Contributor Agreement.</li>
                            <li><strong>Legal obligation</strong> — for KYC, tax withholding, statutory record-keeping and responses to lawful requests.</li>
                            <li><strong>Legitimate use</strong> — as expressly permitted under Section 7 of the DPDP Act, including for employment purposes and to prevent or investigate fraud, network or information security incidents.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">5.</span> Data Sharing
                        </h3>
                        <p className="leading-relaxed">
                            We may share your data with the following categories of recipients, only to the extent necessary for the purposes disclosed in this policy:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li><strong>Clients purchasing approved contribution datasets</strong> — sample recordings are <strong>never</strong> included; only approved contributions delivered under the Contributor Agreement.</li>
                            <li><strong>AI companies, research laboratories and technology platforms</strong> — only in respect of approved contributions, and subject to contractual protections.</li>
                            <li><strong>Service providers</strong> — hosting, storage, payment processors, KYC providers, communication vendors, and professional advisors, bound by confidentiality obligations.</li>
                            <li><strong>Regulatory, law enforcement or judicial authorities</strong> — where required by Applicable Laws or in response to a lawful request.</li>
                        </ul>
                        <p className="mt-3 leading-relaxed">
                            We do <strong>not</strong> sell your personal data (name, contact details, KYC documents) to any third party.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">6.</span> Cross-Border Transfer of Data
                        </h3>
                        <p className="leading-relaxed">
                            Your personal data and approved contributions may be transferred to, stored in, and processed in countries outside India (including but not limited to the United States, the European Union, the United Kingdom, and other jurisdictions where our clients or service providers operate). Any such transfer is made only to recipients bound by contractual protections that require equivalent standards of confidentiality, security and data protection. We do not transfer data to any country or territory notified as restricted by the Central Government under the DPDP Act.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">7.</span> Data Retention
                        </h3>
                        <p className="leading-relaxed">
                            We retain data only for as long as is necessary for the purpose for which it was collected, and thereafter as required for legal, tax, audit or dispute-resolution purposes:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li><strong>Account data</strong> — retained while your account is active and for up to three (3) years after account closure, unless a longer retention period is required by law.</li>
                            <li><strong>Sample recordings</strong> — retained only until reviewed, subject to an absolute maximum of one hundred and eighty (180) days from upload; see Section 3 for details.</li>
                            <li><strong>Approved contributions</strong> — retained on the terms set out in the Contributor Agreement (typically perpetual, in view of the assignment of rights).</li>
                            <li><strong>Payment and financial records</strong> — retained for the periods prescribed under the Income-tax Act, 1961, the Companies Act, 2013, and related statutes (typically eight (8) years).</li>
                            <li><strong>Device and usage logs</strong> — retained for up to twelve (12) months.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">8.</span> Security
                        </h3>
                        <p className="leading-relaxed">
                            We implement reasonable security safeguards including transport-layer encryption (HTTPS/TLS), access controls, authentication controls, encrypted storage of sensitive data, and periodic reviews of our security posture. However, no method of transmission or storage over the internet is completely secure, and we cannot guarantee absolute security.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">9.</span> Data Breach Notification
                        </h3>
                        <p className="leading-relaxed">
                            In the event of a confirmed personal-data breach, we will:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>Notify affected users without undue delay and, where feasible, within seventy-two (72) hours of becoming aware of the breach.</li>
                            <li>Report the breach to the Indian Computer Emergency Response Team (CERT-In) within the timelines prescribed under the IT (Cyber Security) Directions, 2022.</li>
                            <li>Report the breach to the Data Protection Board of India within the timelines prescribed under the DPDP Act, once notified into force.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">10.</span> Your Rights
                        </h3>
                        <p className="leading-relaxed">
                            Subject to the DPDP Act and other Applicable Laws, you have the right to:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li><strong>Access</strong> the personal data we hold about you.</li>
                            <li><strong>Correct</strong> inaccurate or incomplete personal data.</li>
                            <li><strong>Erase</strong> your personal data, subject to legal, contractual and technical limitations. Erasure requests may be limited or refused where content rights have already been assigned to the Company under the Contributor Agreement, or where retention is required for legal or accounting purposes.</li>
                            <li><strong>Withdraw consent</strong> for any processing based on consent. Withdrawal does not affect the lawfulness of processing carried out before withdrawal. Withdrawal of consent to essential processing (for example, account operation or biometric processing) will result in your inability to continue using the Platform.</li>
                            <li><strong>Grievance redressal</strong> — nominate a grievance to our Grievance Officer (see Section 14).</li>
                        </ul>
                        <p className="mt-3 leading-relaxed">
                            To exercise any of these rights, please contact us at the email address in Section 14. We will respond within the timelines prescribed by Applicable Laws.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">11.</span> Age Restriction
                        </h3>
                        <p className="leading-relaxed">
                            The Platform is intended for and available only to users who are eighteen (18) years of age or older. We do not knowingly collect personal data from any individual under 18. If we become aware that a user is under 18, we will terminate the account and delete the personal data associated with it, subject to any legal-retention obligations.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">12.</span> Cookies and Tracking
                        </h3>
                        <p className="leading-relaxed">
                            We use strictly necessary cookies for authentication, session management and security. We may additionally use analytics cookies to understand how the Platform is used, in an aggregated and de-identified form. You can control cookies through your browser settings; disabling essential cookies may impair your ability to use the Platform.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">13.</span> Third-Party Services
                        </h3>
                        <p className="leading-relaxed">
                            The Platform may integrate with or link to third-party services (for example, payment gateways, cloud-storage providers, analytics providers). Those services operate under their own privacy policies. We are not responsible for the privacy practices of third parties, but we take reasonable steps to select vendors that maintain appropriate data-protection standards.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">14.</span> Grievance Officer & Contact
                        </h3>
                        <p className="leading-relaxed">
                            In compliance with the Information Technology Act, 2000, the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, and the DPDP Act, the Grievance Officer for the Platform is:
                        </p>
                        <ul className="list-none pl-0 mt-3 space-y-2 font-medium">
                            <li>Name: <span className="text-neutral-900 dark:text-white">Divyam Bhatia</span></li>
                            <li>Designation: <span className="text-neutral-900 dark:text-white">Founder, M/s DataCatalyst</span></li>
                            <li>Address: <span className="text-neutral-900 dark:text-white">Sri Ganganagar, Rajasthan, India</span></li>
                            <li>Email: <a href="mailto:grievances@datacatalyst.in" className="text-primary-600 dark:text-primary-400 hover:underline">grievances@datacatalyst.in</a></li>
                        </ul>
                        <p className="mt-3 leading-relaxed">
                            We will acknowledge grievances within fifteen (15) days of receipt and endeavour to resolve them within thirty (30) days, in accordance with the IT Rules 2021.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">15.</span> Updates
                        </h3>
                        <p className="leading-relaxed">
                            We may update this Privacy Policy from time to time. Material changes will be notified to you via email or through in-Platform notice, and will take effect on the date specified in the updated policy. Your continued use of the Platform after the effective date constitutes acceptance of the updated policy.
                        </p>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
