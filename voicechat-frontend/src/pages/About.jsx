import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Sparkles, Globe, Heart, Shield, Cpu, ChevronLeft, Mic } from 'lucide-react';

export default function About() {
    // Animation variants
    const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
    const staggerContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.15 } } };

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col font-sans transition-colors duration-300 pt-20 relative overflow-hidden">
            {/* Background Decorative Blobs */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary-500/10 dark:bg-primary-500/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
            <div className="absolute bottom-[10%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-[150px] pointer-events-none z-0"></div>

            <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-white/20 dark:border-neutral-800/50 shadow-sm transition-all duration-300">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-neutral-900 dark:text-white font-bold hover:text-primary-600 transition-colors">
                        <ChevronLeft className="w-5 h-5" /> Back to Home
                    </Link>
                </div>
            </header>

            <main className="flex-1 max-w-5xl mx-auto px-4 py-20 relative z-10">
                {/* Hero / Intro */}
                <motion.div 
                    initial="hidden"
                    animate="visible"
                    variants={fadeIn}
                    className="text-center mb-24"
                >
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-8 mt-12 shadow-inner">
                        <Cpu className="w-10 h-10 animate-pulse" />
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black text-neutral-900 dark:text-white mb-6 tracking-tighter">About Voclara.</h1>
                    <p className="text-xl md:text-2xl text-neutral-600 dark:text-neutral-400 max-w-3xl mx-auto leading-relaxed font-medium">
                        Voclara is a global data collection infrastructure connecting native speakers directly with modern AI development projects.
                    </p>
                </motion.div>

                {/* Our Mission */}
                <motion.div 
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeIn}
                    className="bg-white dark:bg-neutral-900 p-10 md:p-14 rounded-[3rem] border border-neutral-200 dark:border-neutral-800 shadow-xl mb-24 relative overflow-hidden text-center"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 blur-[40px] rounded-full"></div>
                    <h2 className="text-primary-600 dark:text-primary-400 font-black uppercase tracking-widest text-sm mb-4">Our Mission</h2>
                    <h3 className="text-3xl md:text-4xl font-extrabold text-neutral-900 dark:text-white mb-6 leading-snug">
                        To build the most diverse, high-quality, and ethical speech datasets to power the future of global audio AI.
                    </h3>
                    <p className="text-neutral-500 dark:text-neutral-400 text-lg leading-relaxed max-w-2xl mx-auto">
                        Traditional AI models often struggle with local dialects, regional accents, and diverse linguistic nuances. At Voclara, we bridge this gap by enabling real human voice contributors worldwide to submit authentic recordings, creating more inclusive speech recognition systems.
                    </p>
                </motion.div>

                {/* Grid - Key Pillars */}
                <motion.div 
                    variants={staggerContainer}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true }}
                    className="grid md:grid-cols-3 gap-8 mb-24"
                >
                    <motion.div 
                        whileHover={{ y: -8 }}
                        className="bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 shadow-lg relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 blur-[30px] rounded-full"></div>
                        <Globe className="w-8 h-8 text-indigo-600 dark:text-indigo-400 mb-6" />
                        <h4 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">Accents & Accuracies</h4>
                        <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed text-sm">
                            We crowdsource dataset contributions from all over the world, capturing authentic regional accents and slang to make AI models truly global.
                        </p>
                    </motion.div>

                    <motion.div 
                        whileHover={{ y: -8 }}
                        className="bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 shadow-lg relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-success-500/10 blur-[30px] rounded-full"></div>
                        <Heart className="w-8 h-8 text-success-600 dark:text-success-400 mb-6" />
                        <h4 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">Empowering People</h4>
                        <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed text-sm">
                            By paying contributors fair rates for their time, we create new side-income opportunities for anyone with a smartphone and a native language.
                        </p>
                    </motion.div>

                    <motion.div 
                        whileHover={{ y: -8 }}
                        className="bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 shadow-lg relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-error-500/10 blur-[30px] rounded-full"></div>
                        <Shield className="w-8 h-8 text-error-600 dark:text-error-400 mb-6" />
                        <h4 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">Ethical Infrastructure</h4>
                        <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed text-sm">
                            We guarantee full data security, anonymous partner pairings, transparent tracking, and strict contributor privacy.
                        </p>
                    </motion.div>
                </motion.div>

                {/* Final Call to Action banner */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-indigo-900 via-primary-900 to-indigo-950 text-white p-10 md:p-14 border border-primary-800/50 shadow-2xl text-center"
                >
                    <div className="absolute top-0 left-0 w-48 h-48 bg-primary-500/20 blur-[60px] rounded-full pointer-events-none"></div>
                    <div className="relative z-10 max-w-2xl mx-auto">
                        <h3 className="text-3xl md:text-4xl font-extrabold mb-4">Start Contributing Today</h3>
                        <p className="text-primary-100/80 text-lg mb-8 leading-relaxed">
                            No special equipment or expertise needed. If you can talk, you can participate. Complete your setup in just 2 minutes.
                        </p>
                        <Link 
                            to="/signup" 
                            className="inline-flex items-center gap-3 bg-white text-primary-900 font-extrabold text-lg px-8 py-4 rounded-full shadow-lg hover:shadow-white/20 hover:scale-105 active:scale-95 transition-all"
                        >
                            <Mic className="w-5 h-5 text-primary-600" /> Join Voclara
                        </Link>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
