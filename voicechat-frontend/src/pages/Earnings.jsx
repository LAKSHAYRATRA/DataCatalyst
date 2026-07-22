import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Wallet, TrendingUp, ShieldCheck, ChevronLeft } from 'lucide-react';

export default function Earnings() {
    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col font-sans transition-colors duration-300 pt-20">
            <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-white/20 dark:border-neutral-800/50 shadow-sm transition-all duration-300">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-neutral-900 dark:text-white font-bold hover:text-primary-600 transition-colors">
                        <ChevronLeft className="w-5 h-5" /> Back to Home
                    </Link>
                </div>
            </header>

            <main className="flex-1 max-w-5xl mx-auto px-4 py-20">
                <motion.div 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-20"
                >
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400 mb-8 mt-12 shadow-inner">
                        <Wallet className="w-10 h-10" />
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black text-neutral-900 dark:text-white mb-6 tracking-tighter">Your voice is valuable.</h1>
                    <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed font-medium">Turn your spare time into real earnings by participating in our global audio training network. Getting paid has never been this simple.</p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-8 mb-16">
                    <motion.div 
                        whileHover={{ y: -10 }}
                        className="bg-white dark:bg-neutral-900 p-8 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl"
                    >
                        <TrendingUp className="w-8 h-8 text-primary-600 dark:text-primary-400 mb-6" />
                        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">Side Income</h3>
                        <p className="text-neutral-500 dark:text-neutral-400">Participate in voice recording tasks during your free time. Perfect for earning supplementary income at standard project rates.</p>
                    </motion.div>

                    <motion.div 
                        whileHover={{ y: -10 }}
                        className="bg-white dark:bg-neutral-900 p-8 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl"
                    >
                        <Wallet className="w-8 h-8 text-success-600 dark:text-success-400 mb-6" />
                        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">Monthly Payouts</h3>
                        <p className="text-neutral-500 dark:text-neutral-400">Payments are processed on the 21st of every month. Once your tasks are completed and quality-checked, your funds are queued for the monthly cycle.</p>
                    </motion.div>

                    <motion.div 
                        whileHover={{ y: -10 }}
                        className="bg-white dark:bg-neutral-900 p-8 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl"
                    >
                        <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400 mb-6" />
                        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">Transparent Tracking</h3>
                        <p className="text-neutral-500 dark:text-neutral-400">Every recording you submit is logged transparently. Monitor your approval progress and pending earnings directly from your dashboard.</p>
                    </motion.div>
                </div>

                {/* Indian Contributors Section */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-white dark:bg-neutral-900 p-8 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 blur-[40px] rounded-full"></div>
                    <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">Indian Contributors Guidelines 🇮🇳</h3>
                    <p className="text-neutral-600 dark:text-neutral-400 mb-6 leading-relaxed">
                        To receive payouts seamlessly, Indian contributors must complete their <strong>PAN KYC verification</strong> on the platform.
                    </p>
                    <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-850 rounded-2xl p-6">
                        <ul className="list-disc list-inside space-y-3 text-neutral-600 dark:text-neutral-400 font-medium">
                            <li><strong>KYC Completed:</strong> Your TDS (Tax Deducted at Source) will be covered entirely by Voclara.</li>
                            <li><strong>KYC Incomplete/Pending:</strong> A standard <strong>5% TDS deduction</strong> will be applied to your monthly earnings.</li>
                        </ul>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
