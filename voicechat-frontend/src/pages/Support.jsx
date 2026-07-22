import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Mail, Clock, HelpCircle } from 'lucide-react';

export default function Support() {
  const fadeIn = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col font-sans transition-colors duration-300 relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary-500/10 dark:bg-primary-500/25 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800/50 h-20 flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="font-extrabold text-2xl tracking-tighter text-neutral-900 dark:text-white flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center text-white shadow-sm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              Voclara
            </div>
          </Link>
          <Link to="/" className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-white transition-colors">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center pt-32 pb-24 relative z-10">
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={fadeIn}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-black text-neutral-900 dark:text-white mb-4 tracking-tighter">Support Center</h1>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto font-medium">
              Have questions, feedback, or need help with your account? We're here for you.
            </p>
          </motion.div>

          {/* Core Support Card */}
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={fadeIn}
            className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 shadow-xl p-10 md:p-14 text-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 blur-[40px] rounded-full"></div>
            
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-8 shadow-inner">
              <Mail className="w-10 h-10" />
            </div>

            <h2 className="text-3xl font-black text-neutral-900 dark:text-white mb-4">Email Us Directly</h2>
            <p className="text-neutral-500 dark:text-neutral-400 text-lg leading-relaxed max-w-lg mx-auto mb-8">
              Send us an email outlining your issue or question, and our support staff will assist you.
            </p>

            <a 
              href="mailto:support@datacatalyst.in" 
              className="inline-flex items-center gap-3 bg-gradient-primary hover:scale-105 active:scale-95 text-white font-extrabold text-lg px-8 py-4 rounded-full shadow-lg shadow-primary-500/25 transition-all"
            >
              <Mail className="w-5 h-5" /> support@datacatalyst.in
            </a>
          </motion.div>

          {/* Supporting Grid */}
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={fadeIn}
            className="mt-16 grid sm:grid-cols-2 gap-8"
          >
            <div className="bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 p-8 text-center">
              <div className="w-12 h-12 bg-success-100 dark:bg-success-900/30 text-success-650 dark:text-success-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-neutral-900 dark:text-white mb-2">Response Time</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Within 72 hours</p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 p-8 text-center">
              <div className="w-12 h-12 bg-warning-100 dark:bg-warning-900/30 text-warning-650 dark:text-warning-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-neutral-900 dark:text-white mb-2">Platform FAQs</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Check our user dashboard guides</p>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="bg-white dark:bg-neutral-950 border-t border-neutral-200 dark:border-neutral-800 py-12 text-neutral-500 dark:text-neutral-400 transition-colors">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm">© 2026 Voclara. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
