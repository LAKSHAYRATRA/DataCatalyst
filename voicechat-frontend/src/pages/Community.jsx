import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, Heart, ChevronLeft } from 'lucide-react';

export default function Community() {
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
                    className="text-center mb-20 relative"
                >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary-500/10 dark:bg-primary-500/20 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative z-10">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-8 mt-12 shadow-inner">
                            <Users className="w-10 h-10" />
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black text-neutral-900 dark:text-white mb-6 tracking-tighter">A Community of Voices.</h1>
                        <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed font-medium">Join a massive, globally distributed remote workforce. From rural villages to dense cities, our contributors are powering the next era of AI.</p>
                        <div className="mt-10 flex justify-center">
                            <motion.a
                                href="https://discord.gg/TVuj7Brytq"
                                target="_blank"
                                rel="noopener noreferrer"
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="inline-flex items-center gap-3 bg-[#5865F2] hover:bg-[#4752C4] text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all cursor-pointer"
                            >
                                <svg className="w-6 h-6 fill-current" viewBox="0 0 127.14 116.29" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,52.8,6.83,77.19,77.19,0,0,0,49.5,0,105.15,105.15,0,0,0,19.06,8.07C-1.87,39.38-7.51,69.91,5.2,100a105.77,105.77,0,0,0,32,16.29,78.69,78.69,0,0,0,6.72-11A67.36,67.36,0,0,1,33.12,99.8c.84-.62,1.65-1.28,2.44-2a68.64,68.64,0,0,0,82.72,0c.79.67,1.6,1.33,2.44,2a67.36,67.36,0,0,1-10.84,5.49,78.69,78.69,0,0,0,6.72,11,105.77,105.77,0,0,0,32-16.29C135.82,69.91,129.74,39.38,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.87,46,53.87,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.11,46,96.11,53,91,65.69,84.69,65.69Z" />
                                </svg>
                                Join our Discord
                            </motion.a>
                        </div>
                    </div>
                </motion.div>

                <div className="grid md:grid-cols-2 gap-8 mb-20">
                    <motion.div 
                        whileHover={{ y: -5 }}
                        className="bg-white dark:bg-neutral-900 p-8 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl overflow-hidden relative"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[40px] rounded-full"></div>
                        <Globe2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 mb-6 relative z-10" />
                        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4 relative z-10">Global Reach</h3>
                        <p className="text-neutral-500 dark:text-neutral-400 relative z-10">We support dozens of dialects and native languages. Your unique voice print is inherently valuable on the world stage.</p>
                    </motion.div>

                    <motion.div 
                        whileHover={{ y: -5 }}
                        className="bg-white dark:bg-neutral-900 p-8 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl overflow-hidden relative"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-error-500/10 blur-[40px] rounded-full"></div>
                        <Heart className="w-8 h-8 text-error-600 dark:text-error-400 mb-6 relative z-10" />
                        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4 relative z-10">Safe Environment</h3>
                        <p className="text-neutral-500 dark:text-neutral-400 relative z-10">Connect securely inside our browser-based recording studio. You are matched entirely anonymously to protect your privacy at all times.</p>
                    </motion.div>
                </div>

                {/* Simulated avatars section */}
                <div className="text-center">
                    <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
                        {[...Array(12)].map((_, i) => (
                            <motion.div 
                                key={i}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                className="w-16 h-16 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 border-4 border-white dark:border-neutral-950 shadow-md flex items-center justify-center font-bold text-neutral-500 dark:text-neutral-400 text-sm"
                            >
                                U{12 - i}
                            </motion.div>
                        ))}
                    </div>
                    <p className="mt-8 text-sm font-bold text-neutral-400 uppercase tracking-widest">A thriving network of contributors connected 24/7</p>
                </div>
            </main>
        </div>
    );
}

function Globe2(props) {
  // SVG replacement just in case
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
  );
}
