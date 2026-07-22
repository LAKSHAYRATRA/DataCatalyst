import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Scale } from 'lucide-react';

export default function Terms() {
    const fadeIn = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col font-sans transition-colors duration-300 pt-20 relative overflow-hidden">
            {/* Background Decorative Glow */}
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary-500/10 dark:bg-primary-500/25 rounded-full blur-[120px] pointer-events-none z-0"></div>

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
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-650 dark:text-indigo-400 mb-6 mt-8">
                        <Scale className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black text-neutral-900 dark:text-white mb-4 tracking-tighter">Terms of Service</h1>
                    <p className="text-neutral-500 dark:text-neutral-400 text-lg uppercase tracking-wider font-bold">Last Updated: 20/07/2026</p>
                </motion.div>

                <motion.div 
                    initial="hidden"
                    animate="visible"
                    variants={fadeIn}
                    className="bg-white dark:bg-neutral-900 p-8 md:p-12 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 shadow-xl space-y-10 text-neutral-700 dark:text-neutral-300"
                >
                    <p className="leading-relaxed font-medium">
                        These Terms of Service ("Terms") govern your access to and use of Voclara ("Platform"), operated by M/s DataCatalyst, a partnership firm registered under the Indian Partnership Act, 1932 ("Company", "we", "us", "our"). By creating an account or otherwise accessing or using the Platform you agree to these Terms, our Privacy Policy, and — if you become an approved contributor — our Contributor Agreement.
                    </p>
                    <p className="leading-relaxed">
                        If you do not agree to any of these Terms, you must not access or use the Platform.
                    </p>

                    <hr className="border-neutral-200 dark:border-neutral-800" />

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">1.</span> Eligibility
                        </h3>
                        <p className="leading-relaxed">
                            You represent and warrant that you are:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>At least eighteen (18) years of age;</li>
                            <li>Legally competent to enter into a binding contract under the Indian Contract Act, 1872;</li>
                            <li>Not a person barred from receiving services under the laws of India or any other applicable jurisdiction; and</li>
                            <li>Not a person on any Indian or international sanctions or terrorism-financing list.</li>
                        </ul>
                        <p className="mt-3 leading-relaxed">
                            We may verify your eligibility at any time and may suspend or terminate access if any of the above ceases to be true.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">2.</span> Account Registration
                        </h3>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>You agree to provide accurate, current and complete information at registration and to keep it updated.</li>
                            <li>You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</li>
                            <li>You may not create more than one account, transfer your account to another person, or allow another person to use your account.</li>
                            <li>We may refuse to register, suspend or terminate any account at our discretion, including where the information provided is false, incomplete or misleading.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">3.</span> Services
                        </h3>
                        <p className="leading-relaxed">
                            Voclara is a voice-data collection platform. Through the Platform, contributors may:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>Register an account and submit a <strong>sample voice recording</strong> for suitability review;</li>
                            <li>Upon approval, sign the Contributor Agreement and participate in paid voice-data collection tasks published by the Company;</li>
                            <li>Receive payment for approved Content in accordance with Section 8 (Payments).</li>
                        </ul>
                        <p className="mt-3 leading-relaxed">
                            The Platform does not guarantee any minimum amount of paid work.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">4.</span> Sample Recording — Scope and Handling
                        </h3>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>The sample voice recording is submitted <strong>solely for suitability assessment</strong>.</li>
                            <li>The sample <strong>will not be sold, licensed, shared with any client, or used to train, fine-tune, evaluate or deploy any AI or machine-learning system.</strong></li>
                            <li>The sample is retained only until the review is complete, subject to an absolute maximum retention period of one hundred and eighty (180) days from upload. If your account is not approved, the sample is permanently deleted no later than 180 days from upload. If the sample is not reviewed within 180 days, it is deleted regardless.</li>
                            <li>Nothing in these Terms grants the Company any commercial rights over the sample recording. Commercial rights over Content arise only after you have signed the Contributor Agreement and submitted approved Content thereunder.</li>
                            <li>You must tick the three consent checkboxes (Terms of Service, Privacy Policy, Sample Recording Consent) before you are permitted to record and submit your sample.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">5.</span> Contributor Warranties
                        </h3>
                        <p className="leading-relaxed">
                            By using the Platform and by submitting any Content, you represent, warrant and covenant that:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>You are the sole author and owner of your voice and of any Content you submit, or you have obtained all necessary rights, licences and consents from every identifiable person featured in the Content;</li>
                            <li>The Content is your own live vocal performance and is <strong>not</strong> generated, cloned, synthesised or reproduced by any artificial-intelligence system;</li>
                            <li>The Content does not infringe the intellectual-property rights, privacy rights, publicity rights or any other rights of any third party;</li>
                            <li>The Content does not contain any unlawful, obscene, defamatory, hateful, harassing, misleading, threatening, or otherwise objectionable material;</li>
                            <li>All information you provide (including name, date of birth, address, KYC documents and payment details) is true, accurate and current;</li>
                            <li>You are not impersonating any other person or entity.</li>
                        </ul>
                        <p className="mt-3 leading-relaxed font-semibold text-red-500 dark:text-red-400">
                            Breach of any warranty in this Section 5 is a material breach of these Terms and may result in immediate termination and forfeiture of pending payments, in addition to any other remedy available to the Company.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">6.</span> Prohibited Conduct
                        </h3>
                        <p className="leading-relaxed">
                            You must not:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>Submit any Content that is illegal, harmful, restricted, infringing, deceptive, or that you do not have the right to submit;</li>
                            <li>Submit AI-generated, cloned or synthesised audio as if it were your live voice;</li>
                            <li>Access the Platform using automated means (bots, scrapers, crawlers) or interfere with the Platform's operation;</li>
                            <li>Attempt to gain unauthorised access to the Platform, other accounts, computer systems or networks connected to the Platform;</li>
                            <li>Reverse-engineer, decompile or disassemble any part of the Platform;</li>
                            <li>Use the Platform to develop a competing product or service, or to benchmark it for a competitor;</li>
                            <li>Circumvent any technical measures used to protect the Platform, contributor payments, or Content.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">7.</span> Content Rights (Post-Approval)
                        </h3>
                        <p className="leading-relaxed">
                            Upon your account being approved and your signing of the Contributor Agreement, any Content you subsequently submit is governed by the assignment and licensing terms of the Contributor Agreement. In summary (and without limiting the Contributor Agreement), you agree to assign to the Company, on an exclusive, perpetual, irrevocable, worldwide, transferable and sublicensable basis, all rights, title and interest in the Content, for use in AI training, machine-learning research, evaluation, commercial deployment and any other lawful purpose. This Section 7 does <strong>not</strong> apply to the initial sample recording, which is governed by Section 4.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">8.</span> Payments
                        </h3>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>Payments to contributors follow a net thirty (30) day cycle from the date of Content approval by our review team.</li>
                            <li>Payments <strong>may be delayed</strong> if the corresponding payment from the client is delayed, cancelled, paused, disputed, or subject to change.</li>
                            <li>Payments may be processed once alternative client demand for the Content is secured.</li>
                            <li>No royalties, revenue-share or recurring payments are provided; each approved Content submission is compensated by a one-time payment.</li>
                            <li>All payments are made in Indian Rupees (INR), typically via bank transfer or UPI, to the account details you provide.</li>
                            <li>
                                Payments are subject to tax deduction at source ("TDS") under Section 194O of the Income-tax Act, 1961, on the following basis:
                                <ul className="list-circle pl-6 mt-2 space-y-1">
                                    <li><strong>If you have provided your Permanent Account Number (PAN)</strong> as part of KYC, no TDS is deducted while your cumulative earnings from the Platform in a financial year remain below ₹5,00,000 (Rupees Five Lakhs). Once cumulative earnings reach or exceed ₹5,00,000, TDS at 1% is deducted on the <strong>full gross amount</strong> of the payment that crosses the threshold and on the <strong>full gross amount</strong> of every subsequent payment in that financial year.</li>
                                    <li><strong>If you have not provided your PAN</strong>, TDS at 5% is deducted from every payment starting from the first rupee, in accordance with Section 206AA of the Income-tax Act. This amount cannot be reclaimed by you.</li>
                                </ul>
                            </li>
                            <li>We will issue TDS certificates (Form 16A) and the deductions will be reflected in your Form 26AS as required by law.</li>
                            <li>Additional statutory deductions (for example, GST reverse charge, professional tax) may apply where the law so requires.</li>
                            <li>It is your responsibility to file your own income-tax returns and comply with any other tax and reporting obligations that apply to you.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">9.</span> Exclusivity
                        </h3>
                        <p className="leading-relaxed">
                            Content created by you for Voclara must not be recorded, reused, uploaded, sold, licensed or submitted to any other voice-data platform, dataset provider or AI-training programme. Violation of this exclusivity clause may result in:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>Immediate account suspension or permanent termination;</li>
                            <li>Forfeiture of all pending payments; and</li>
                            <li>Recovery of amounts already paid to you in respect of the Content in question, along with any additional damages the Company may suffer.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">10.</span> Account Termination
                        </h3>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>You may close your account at any time by contacting us at the email address in Section 18.</li>
                            <li>We may suspend or terminate your account at any time, with or without cause and with or without notice, including for breach of these Terms, suspected fraud, or non-use.</li>
                            <li>On termination, your right to access the Platform ceases immediately. All rights previously assigned to the Company under the Contributor Agreement survive termination.</li>
                            <li>Settlement of pending payments on termination will be governed by Section 8 and by the reason for termination (for example, payments may be forfeit in the case of a breach of Section 5 or Section 9).</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">11.</span> Cooldown After Termination
                        </h3>
                        <p className="leading-relaxed">
                            If your account is terminated by us for breach of these Terms, you may not create a new account, whether under your own name or a different name, for a period of twelve (12) months from the date of termination. Any account discovered to violate this cooldown will be terminated immediately.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">12.</span> Limitation of Liability
                        </h3>
                        <p className="leading-relaxed">
                            To the maximum extent permitted by law:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>The Platform and all services are provided on an "as is" and "as available" basis, without any warranty of any kind, express or implied.</li>
                            <li>The Company shall not be liable for any indirect, incidental, consequential, special, exemplary or punitive damages, or for any loss of profits, revenue, data, business opportunities, or goodwill, arising out of or in connection with your use of the Platform.</li>
                            <li>The Company's total aggregate liability under or in connection with these Terms shall not exceed the total amount paid to you by the Company in the twelve (12) months preceding the event giving rise to the claim.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">13.</span> Indemnification
                        </h3>
                        <p className="leading-relaxed">
                            You agree to defend, indemnify and hold harmless the Company, its directors, officers, employees, agents and affiliates from and against any and all claims, demands, actions, losses, liabilities, damages, costs and expenses (including reasonable legal fees) arising out of or in connection with:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>Your breach of these Terms, the Privacy Policy or the Contributor Agreement;</li>
                            <li>Your violation of any Applicable Law or any third-party right (including intellectual-property, privacy or publicity rights);</li>
                            <li>Any Content submitted by you being unauthorised, unlawful, infringing, AI-generated or otherwise in breach of your warranties in Section 5.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">14.</span> Force Majeure
                        </h3>
                        <p className="leading-relaxed">
                            The Company shall not be liable for any failure or delay in performance caused by events beyond its reasonable control, including acts of God, war, terrorism, riots, embargoes, acts of civil or military authorities, pandemics, fire, floods, earthquakes, accidents, network or power outages, or interruptions to internet or telecommunications infrastructure.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">15.</span> Changes to the Terms
                        </h3>
                        <p className="leading-relaxed">
                            We may amend these Terms from time to time. Material changes will be notified to you via email or in-Platform notice at least seven (7) days before they take effect. Your continued use of the Platform after the effective date constitutes acceptance of the amended Terms. If you do not agree to the amended Terms, your sole remedy is to close your account before the effective date.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">16.</span> Dispute Resolution
                        </h3>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>The parties shall first attempt in good faith to resolve any dispute arising out of or in connection with these Terms through direct negotiation, initiated by written notice from one party to the other.</li>
                            <li>If the dispute is not resolved within thirty (30) days of the notice, it shall be finally settled by binding arbitration under the Arbitration and Conciliation Act, 1996.</li>
                            <li>The arbitration shall be conducted by a sole arbitrator appointed by mutual agreement, or failing agreement, by the Company.</li>
                            <li>The seat and venue of arbitration shall be Sri Ganganagar, Rajasthan, India.</li>
                            <li>The language of arbitration shall be English.</li>
                            <li>The award of the arbitrator shall be final and binding on the parties.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">17.</span> Governing Law and Jurisdiction
                        </h3>
                        <p className="leading-relaxed">
                            These Terms are governed by and construed in accordance with the laws of India. Subject to Section 16 (Dispute Resolution), the courts at Sri Ganganagar, Rajasthan shall have exclusive jurisdiction over any matter arising out of or in connection with these Terms.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">18.</span> Grievance Officer & Contact
                        </h3>
                        <p className="leading-relaxed">
                            In compliance with the Information Technology Act, 2000 and the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, the Grievance Officer for the Platform is:
                        </p>
                        <ul className="list-none pl-0 mt-3 space-y-2 font-medium">
                            <li>Name: <span className="text-neutral-900 dark:text-white">Divyam Bhatia</span></li>
                            <li>Designation: <span className="text-neutral-900 dark:text-white">Founder, M/s DataCatalyst</span></li>
                            <li>Address: <span className="text-neutral-900 dark:text-white">Sri Ganganagar, Rajasthan, India</span></li>
                            <li>Email: <a href="mailto:grievances@datacatalyst.in" className="text-primary-600 dark:text-primary-400 hover:underline">grievances@datacatalyst.in</a></li>
                        </ul>
                        <p className="mt-3 leading-relaxed">
                            We will acknowledge grievances within fifteen (15) days of receipt and endeavour to resolve them within thirty (30) days.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="text-primary-500 font-mono">19.</span> Miscellaneous
                        </h3>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li><strong>Entire Agreement</strong> — These Terms, together with the Privacy Policy and (for approved contributors) the Contributor Agreement, constitute the entire agreement between you and the Company regarding the Platform.</li>
                            <li><strong>Severability</strong> — If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</li>
                            <li><strong>No Waiver</strong> — Failure by the Company to enforce any right under these Terms shall not constitute a waiver of that right.</li>
                            <li><strong>Assignment</strong> — You may not assign or transfer these Terms, or any rights or obligations under them, without our prior written consent. We may assign these Terms in connection with a merger, acquisition or sale of all or substantially all of our assets.</li>
                            <li><strong>Notices</strong> — Notices to you may be given by email to the address associated with your account or by in-Platform notice. Notices to the Company must be sent to the address in Section 18.</li>
                        </ul>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
