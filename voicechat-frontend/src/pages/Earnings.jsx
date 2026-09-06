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

                <div className="grid md:grid-cols-3 gap-6 mb-16">
                    <motion.div 
                        whileHover={{ y: -6 }}
                        className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-8 rounded-3xl border border-neutral-800 hover:border-neutral-700 shadow-xl transition-all duration-300 group"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-primary-500/15 transition-all" />
                        <div className="relative z-10">
                            <div className="p-3.5 bg-primary-900/30 border border-primary-800/40 rounded-2xl w-fit mb-6">
                                <TrendingUp className="w-8 h-8 text-primary-400" />
                            </div>
                            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Side Income</h3>
                            <p className="text-neutral-400 text-sm leading-relaxed">Participate in voice recording tasks during your free time. Perfect for earning supplementary income at standard project rates.</p>
                        </div>
                    </motion.div>

                    <motion.div 
                        whileHover={{ y: -6 }}
                        className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-8 rounded-3xl border border-neutral-800 hover:border-neutral-700 shadow-xl transition-all duration-300 group"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/15 transition-all" />
                        <div className="relative z-10">
                            <div className="p-3.5 bg-emerald-900/30 border border-emerald-800/40 rounded-2xl w-fit mb-6">
                                <Wallet className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Monthly Payouts</h3>
                            <p className="text-neutral-400 text-sm leading-relaxed">Payments are processed on the 21st of every month. Once your tasks are completed and quality-checked, your funds are queued for the monthly cycle.</p>
                        </div>
                    </motion.div>

                    <motion.div 
                        whileHover={{ y: -6 }}
                        className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-8 rounded-3xl border border-neutral-800 hover:border-neutral-700 shadow-xl transition-all duration-300 group"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/15 transition-all" />
                        <div className="relative z-10">
                            <div className="p-3.5 bg-indigo-900/30 border border-indigo-800/40 rounded-2xl w-fit mb-6">
                                <ShieldCheck className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Transparent Tracking</h3>
                            <p className="text-neutral-400 text-sm leading-relaxed">Every recording you submit is logged transparently. Monitor your approval progress and pending earnings directly from your dashboard.</p>
                        </div>
                    </motion.div>
                </div>

                {/* Indian Contributors Section */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-8 md:p-10 rounded-3xl border border-neutral-800 shadow-xl"
                >
                    <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10">
                        <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Indian Contributors Guidelines 🇮🇳</h3>
                        <p className="text-neutral-400 mb-6 leading-relaxed text-sm">
                            To receive payouts seamlessly, Indian contributors must complete their <strong className="text-white">PAN KYC verification</strong> on the platform.
                        </p>
                        <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-6">
                            <ul className="list-disc list-inside space-y-3 text-neutral-300 text-sm font-medium">
                                <li><strong className="text-white">KYC Completed:</strong> Your TDS (Tax Deducted at Source) will be covered entirely by Voclara.</li>
                                <li><strong className="text-white">KYC Incomplete/Pending:</strong> A standard <strong className="text-rose-400">5% TDS deduction</strong> will be applied to your monthly earnings.</li>
                            </ul>
                        </div>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
