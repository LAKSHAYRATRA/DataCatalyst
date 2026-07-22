import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserInfo, clearToken } from '../lib/auth.js';
import { motion } from 'framer-motion';
import { Mic, Globe2, Ear, Coins, PlayCircle, TrendingUp, Sparkles, ChevronDown, LayoutDashboard, LogOut, ChevronRight } from 'lucide-react';
export default function Landing() {
  const [userInfo, setUserInfo] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    setUserInfo(getUserInfo());
  }, []);

  const handleLogout = () => {
    clearToken();
    setUserInfo(null);
    window.location.reload();
  };

  // Animation variants
  const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
  const staggerContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.2 } } };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col font-sans selection:bg-primary-500/30 transition-colors duration-300">
      
      {/* Decorative Global Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary-500/10 dark:bg-primary-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[60%] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-white/20 dark:border-neutral-800/50 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group relative z-10">
            <motion.img 
              whileHover={{ rotate: -10, scale: 1.1 }}
              src="/logo.png" 
              alt="Voclara Logo" 
              className="w-12 h-12 object-contain" 
            />
            <span className="font-extrabold text-2xl tracking-tighter text-neutral-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              Voclara
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-10 bg-neutral-100/50 dark:bg-neutral-900/50 px-8 py-3 rounded-full border border-neutral-200/50 dark:border-neutral-800/50 backdrop-blur-sm">
            {['Opportunities', 'Workflow'].map((item) => (
              <a 
                key={item}
                href={`#${item.toLowerCase()}`} 
                className="text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-white transition-colors uppercase tracking-widest relative group"
              >
                {item}
                <span className="absolute -bottom-2 left-0 w-0 h-0.5 bg-primary-500 group-hover:w-full transition-all duration-300"></span>
              </a>
            ))}
            <Link to="/earnings" className="text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-white transition-colors uppercase tracking-widest relative group">
              Earnings
              <span className="absolute -bottom-2 left-0 w-0 h-0.5 bg-primary-500 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link to="/community" className="text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-white transition-colors uppercase tracking-widest relative group">
              Community
              <span className="absolute -bottom-2 left-0 w-0 h-0.5 bg-primary-500 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link to="/about" className="text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-white transition-colors uppercase tracking-widest relative group">
              About
              <span className="absolute -bottom-2 left-0 w-0 h-0.5 bg-primary-500 group-hover:w-full transition-all duration-300"></span>
            </Link>
          </nav>

          <div className="flex items-center gap-4 relative z-10">
            {userInfo ? (
              <div
                className="relative flex items-center"
                onMouseEnter={() => setIsDropdownOpen(true)}
                onMouseLeave={() => setIsDropdownOpen(false)}
              >
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-primary-300 dark:hover:border-primary-700 py-1.5 px-2 pr-4 rounded-full transition-all shadow-sm"
                >
                  <div className="w-10 h-10 bg-gradient-to-tr from-primary-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md">
                    {userInfo.firstname?.[0] || userInfo.username?.[0] || 'U'}
                  </div>
                  <div className="hidden sm:flex flex-col items-start text-left">
                    <span className="text-sm font-black text-neutral-900 dark:text-white leading-tight">{userInfo.username || userInfo.firstname}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute right-0 top-full pt-4 w-56 z-50 origin-top-right"
                  >
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-2">
                       <div className="px-4 py-3 mb-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl">
                          <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-1">Signed in as</p>
                          <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">{userInfo.email}</p>
                       </div>
                      <Link
                        to="/dashboard"
                        className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-400 rounded-xl transition-colors"
                      >
                       <LayoutDashboard className="w-4 h-4" /> Dashboard
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 mt-1 text-sm font-bold text-error-600 hover:bg-error-50 dark:hover:bg-error-900/30 rounded-xl transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" /> Logout
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="text-sm font-bold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors hidden sm:block uppercase tracking-widest px-4">
                  Log in
                </Link>
                <Link to="/signup" className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-primary-600 dark:hover:bg-primary-500 text-sm font-black px-6 py-3 rounded-full transition-colors shadow-lg hover:shadow-primary-500/30">
                  Signup
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 pt-20 relative z-10">

        {/* Hero Section */}
        <section className="relative pt-24 pb-32 lg:pt-32 lg:pb-40 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 lg:gap-8 items-center">

              <motion.div 
                initial="hidden"
                animate="visible"
                variants={staggerContainer}
                className="max-w-2xl text-left"
              >
                <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 dark:bg-black/20 border border-neutral-200 dark:border-neutral-800 backdrop-blur-md text-sm font-bold mb-8 shadow-sm">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400">
                    <Sparkles className="w-3 h-3" />
                  </span>
                  <span className="text-neutral-800 dark:text-neutral-200">Global AI Voice Training Infrastructure</span>
                </motion.div>

                <motion.h1 variants={fadeIn} className="text-5xl sm:text-6xl lg:text-[5.5rem] font-black tracking-tighter text-neutral-900 dark:text-white mb-8 leading-[1.05]">
                  Get paid to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-500 drop-shadow-sm">talk.</span>
                </motion.h1>

                <motion.p variants={fadeIn} className="text-xl sm:text-2xl text-neutral-600 dark:text-neutral-400 mb-10 max-w-lg leading-relaxed font-medium">
                  Have natural conversations or read short scripts to help train the next generation of audio AI. Completely remote. Setup takes 2 minutes.
                </motion.p>

                <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4">
                  <Link to="/signup" className="bg-primary-600 hover:bg-primary-500 text-white shadow-xl shadow-primary-500/30 text-lg font-bold px-8 py-5 rounded-full flex justify-center items-center gap-3 transition-all hover:scale-105 active:scale-95">
                    Start Earning Now
                    <TrendingUp className="w-5 h-5" />
                  </Link>
                  <a href="#workflow" className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white border-2 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-lg font-bold rounded-full px-8 py-5 flex justify-center items-center transition-colors">
                    How it works
                  </a>
                </motion.div>


              </motion.div>

              {/* Right Visual Jaw Dropping 3D Element */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, x: 50 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ duration: 1, type: "spring" }}
                className="relative mx-auto w-full max-w-md lg:max-w-none lg:ml-auto h-[500px]"
              >
                {/* Main Holographic Card */}
                <motion.div 
                  animate={{ y: [0, -15, 0] }}
                  transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                  className="absolute inset-0 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl rounded-[3rem] border border-white/60 dark:border-neutral-700/50 shadow-2xl p-8"
                >
                  <div className="flex justify-between items-start mb-8">
                     <div className="flex gap-3">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-lg">
                           <Mic className="w-6 h-6 text-white" />
                        </div>
                        <div>
                           <div className="font-bold text-neutral-900 dark:text-white text-lg">Live Session</div>
                           <div className="text-success-600 dark:text-success-400 font-bold text-sm tracking-widest uppercase flex items-center gap-2 mt-1">
                              <span className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></span> Recording
                           </div>
                        </div>
                     </div>
                      <div className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 rounded-xl font-extrabold text-sm shadow-lg uppercase tracking-wider">
                         Verified
                      </div>
                  </div>

                  <div className="bg-neutral-100/50 dark:bg-neutral-950/50 rounded-2xl p-6 border border-neutral-200/50 dark:border-neutral-800/50 backdrop-blur-sm">
                     <div className="flex items-center justify-between font-mono text-neutral-500 dark:text-neutral-400 text-sm mb-4">
                        <span>L: -12.4dB</span>
                        <span className="text-primary-600 dark:text-primary-400 font-bold">14:02:44</span>
                        <span>R: -14.1dB</span>
                     </div>
                     <div className="flex items-end justify-center gap-1.5 h-24">
                        {[40, 60, 30, 80, 100, 70, 50, 90, 60, 40, 80, 100, 60, 40, 30].map((h, i) => (
                          <div key={i} className="w-4 bg-gradient-to-t from-primary-600 to-primary-300 dark:from-primary-500 dark:to-indigo-400 rounded-t-sm" style={{ height: `${h}%`, animation: `pulse ${0.5 + Math.random()}s infinite alternate` }}></div>
                        ))}
                     </div>
                  </div>
                </motion.div>

                {/* Floating Widget 1 */}
                <motion.div
                   animate={{ y: [0, 20, 0] }}
                   transition={{ repeat: Infinity, duration: 8, ease: "easeInOut", delay: 1 }}
                   className="absolute -left-12 bottom-12 bg-white dark:bg-neutral-800 p-5 rounded-2xl shadow-xl border border-neutral-100 dark:border-neutral-700 flex items-center gap-4 z-20"
                >
                   <div className="w-12 h-12 bg-success-100 dark:bg-success-900/30 rounded-full flex items-center justify-center">
                      <Coins className="w-6 h-6 text-success-600 dark:text-success-400" />
                   </div>
                   <div>
                      <div className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Monthly Earnings</div>
                      <div className="text-xl font-black text-neutral-900 dark:text-white">$18.50</div>
                   </div>
                </motion.div>

                {/* Floating Widget 2 */}
                <motion.div
                   animate={{ y: [0, -20, 0] }}
                   transition={{ repeat: Infinity, duration: 7, ease: "easeInOut", delay: 2 }}
                   className="absolute -right-8 top-12 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 p-5 rounded-2xl shadow-xl flex items-center gap-4 z-20"
                >
                   <div>
                      <div className="text-xs font-bold opacity-60 uppercase tracking-widest mb-1">New Milestone</div>
                      <div className="text-base font-black">5 Hours Reached ⭐</div>
                   </div>
                </motion.div>
              </motion.div>

            </div>
          </div>
        </section>

        {/* Jobs/Opportunities Grid */}
        <section className="py-32 relative bg-white dark:bg-neutral-950 transition-colors" id="opportunities">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
               initial={{ opacity: 0, y: 30 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true, margin: "-100px" }}
               className="text-center max-w-3xl mx-auto mb-20"
            >
              <h2 className="text-primary-600 dark:text-primary-400 font-bold tracking-widest uppercase text-sm mb-4">Opportunities</h2>
              <h3 className="text-4xl md:text-5xl lg:text-6xl font-black text-neutral-900 dark:text-white mb-6 tracking-tight">Audio Task Board</h3>
              <p className="text-xl text-neutral-600 dark:text-neutral-400 font-medium">Strictly voice-only roles. Pick between long-form conversations or rapid-fire phrase recording.</p>
            </motion.div>

            <div className="flex overflow-x-auto pb-12 pt-4 snap-x snap-mandatory hide-scroll gap-6 px-4" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
              
              {/* Feature Card 1: Phrase Recording (The New Feature!) */}
              <motion.div 
                 initial={{ opacity: 0, x: 50 }}
                 whileInView={{ opacity: 1, x: 0 }}
                 viewport={{ once: true }}
                 whileHover={{ scale: 1.05, y: -15, zIndex: 50 }}
                 className="relative group rounded-[2.5rem] bg-gradient-to-b from-indigo-500 to-indigo-700 p-1 shrink-0 w-[85vw] md:w-[600px] snap-center shadow-2xl shadow-indigo-500/20 transition-all duration-300 ease-out"
              >
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjIpIi8+PC9zdmc+')] opacity-40 rounded-[2.5rem] pointer-events-none"></div>
                  <div className="h-full bg-neutral-950/40 backdrop-blur-sm rounded-[2.4rem] p-8 md:p-10 flex flex-col justify-between overflow-hidden relative z-10 text-white">
                      <div>
                          <div className="flex justify-between items-start mb-8">
                             <span className="bg-white text-indigo-900 text-xs font-black px-4 py-2 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-2">
                                <Sparkles className="w-4 h-4" /> Best For Beginners
                             </span>
                          </div>
                          <h4 className="text-4xl font-black mb-4">Phrase Studio</h4>
                          <p className="text-lg text-indigo-100 font-medium mb-8 leading-relaxed max-w-md">No partner required! Read 5-second scripts independently. High approval rate, perfect for making quick cash in your spare time.</p>
                      </div>
                      <Link to="/signup" className="mt-8 bg-white/10 hover:bg-white text-white hover:text-indigo-900 border border-white/20 font-black text-lg text-center py-4 rounded-xl transition-all uppercase tracking-widest backdrop-blur-md">
                          Open Studio →
                      </Link>
                  </div>
              </motion.div>

              {/* Card 2 */}
              <motion.div 
                 initial={{ opacity: 0, x: 50 }}
                 whileInView={{ opacity: 1, x: 0 }}
                 viewport={{ once: true }}
                 transition={{ delay: 0.1 }}
                 whileHover={{ scale: 1.05, y: -15, zIndex: 50 }}
                 className="group rounded-[2.5rem] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-8 flex flex-col justify-between hover:border-primary-300 dark:hover:border-primary-700 shadow-lg shadow-neutral-200/50 dark:shadow-none shrink-0 w-[85vw] md:w-[400px] snap-center transition-all duration-300 ease-out"
              >
                 <div>
                    <div className="mb-8">
                       <span className="bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-400 text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-widest border border-warning-200 dark:border-warning-800">
                          High Demand
                       </span>
                    </div>
                    <div className="text-5xl mb-6">🇮🇳</div>
                    <h4 className="text-2xl font-black text-neutral-900 dark:text-white mb-3">Hindi Conversational</h4>
                    <p className="text-neutral-500 dark:text-neutral-400">Engage in structured voice-only calls in native Hindi. Subject matter experts preferred.</p>
                 </div>
                 <Link to="/signup" className="mt-8 font-black text-primary-600 dark:text-primary-400 flex items-center group-hover:gap-2 transition-all">
                     Apply Now <ChevronRight className="w-5 h-5 opacity-0 -ml-5 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                 </Link>
              </motion.div>

              {/* Card 3 */}
              <motion.div 
                 initial={{ opacity: 0, x: 50 }}
                 whileInView={{ opacity: 1, x: 0 }}
                 viewport={{ once: true }}
                 transition={{ delay: 0.2 }}
                 whileHover={{ scale: 1.05, y: -15, zIndex: 50 }}
                 className="group rounded-[2.5rem] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-8 flex flex-col justify-between hover:border-primary-300 dark:hover:border-primary-700 shadow-lg shadow-neutral-200/50 dark:shadow-none shrink-0 w-[85vw] md:w-[400px] snap-center transition-all duration-300 ease-out"
              >
                 <div>
                    <div className="mb-8">
                       <span className="bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-400 text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-widest border border-success-200 dark:border-success-800">
                          Consistent
                       </span>
                    </div>
                    <div className="text-5xl mb-6">🇬🇧</div>
                    <h4 className="text-2xl font-black text-neutral-900 dark:text-white mb-3">English Conversational</h4>
                    <p className="text-neutral-500 dark:text-neutral-400">Record natural 15-minute voice-only conversations about everyday topics in native English.</p>
                 </div>
                 <Link to="/signup" className="mt-8 font-black text-primary-600 dark:text-primary-400 flex items-center group-hover:gap-2 transition-all">
                     Apply Now <ChevronRight className="w-5 h-5 opacity-0 -ml-5 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                 </Link>
              </motion.div>

            </div>
          </div>
        </section>

        {/* Workflow Section */}
        <section className="py-32 bg-neutral-950 text-white relative overflow-hidden" id="workflow">
          {/* Neon BG Orbs */}
          <div className="absolute top-1/2 left-1/4 w-[600px] h-[600px] bg-primary-600 rounded-full blur-[200px] opacity-20 transform -translate-y-1/2 pointer-events-none"></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <motion.div 
                 initial={{ opacity: 0, x: -50 }}
                 whileInView={{ opacity: 1, x: 0 }}
                 viewport={{ once: true }}
              >
                <h2 className="text-primary-400 font-bold tracking-widest uppercase text-sm mb-4">The Workflow</h2>
                <h3 className="text-4xl md:text-5xl font-black mb-8 leading-tight tracking-tight">Your voice powers the future of AI.</h3>
                <p className="text-xl text-neutral-400 mb-12 leading-relaxed font-medium">No cameras. Just your microphone. Your audio contributions help train next-generation voice assistants and real-time translation tools.</p>

                <div className="space-y-10">
                  {[
                     { num: 1, title: 'Get Matched', desc: 'Sign in to the dashboard and our system instantly pairs you with a partner who speaks your language natively, or assigns you phrase scripts.' },
                     { num: 2, title: 'Hit Record', desc: 'Join the browser-based studio. Read the topic prompt and just have a natural, casual voice call or read aloud.' },
                     { num: 3, title: 'Monthly Payout', desc: 'Once the recording finishes and is verified for clarity, your approved earnings are added to your balance for payment on the 21st of every month.' }
                  ].map((step, i) => (
                     <div key={i} className="flex gap-6 group">
                        <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-700/50 flex items-center justify-center font-black text-2xl text-white shrink-0 group-hover:border-primary-500 group-hover:bg-primary-900/20 group-hover:text-primary-400 transition-all shadow-xl">
                           {step.num}
                        </div>
                        <div>
                           <h4 className="text-2xl font-bold mb-3">{step.title}</h4>
                           <p className="text-neutral-400 leading-relaxed font-medium text-lg">{step.desc}</p>
                        </div>
                     </div>
                  ))}
                </div>
              </motion.div>

              {/* Holographic Right UI representation */}
              <motion.div 
                 initial={{ opacity: 0, scale: 0.9 }}
                 whileInView={{ opacity: 1, scale: 1 }}
                 viewport={{ once: true }}
                 className="relative w-full aspect-square md:aspect-auto md:h-[600px] perspective-1000"
              >
                 <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-[3rem] border border-neutral-700 p-8 shadow-2xl flex flex-col justify-between hover:rotate-y-12 transition-transform duration-700 ease-out">
                    <div className="flex justify-between items-center mb-8 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                       <div className="flex items-center gap-3">
                          <Ear className="w-5 h-5 text-neutral-400" />
                          <span className="font-bold tracking-widest text-sm text-neutral-400 uppercase">Listening...</span>
                       </div>
                       <span className="font-mono text-warning-400 font-bold text-xl">11:42</span>
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center gap-4">
                       {[30, 70, 50, 90, 100].map((h, i) => (
                          <div key={i} className="w-full bg-neutral-800 rounded-lg overflow-hidden h-4">
                             <motion.div 
                                animate={{ width: [`${h-20}%`, `${h}%`, `${h-20}%`] }}
                                transition={{ repeat: Infinity, duration: 1.5 + (i*0.2), ease: 'easeInOut' }}
                                className="h-full bg-gradient-to-r from-primary-600 to-indigo-500 rounded-lg shadow-[0_0_15px_rgba(79,70,229,0.5)]"
                             />
                          </div>
                       ))}
                    </div>

                    <div className="flex justify-center mt-12 gap-8">
                        <div className="w-16 h-16 rounded-full bg-error-500/20 border border-error-500 flex items-center justify-center animate-pulse">
                           <div className="w-8 h-8 bg-error-500 rounded-sm"></div>
                        </div>
                    </div>
                 </div>
              </motion.div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-neutral-950 py-16 border-t border-neutral-200 dark:border-neutral-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Voclara Logo" className="w-10 h-10 object-contain grayscale opacity-60" />
              <span className="font-black text-2xl tracking-tighter text-neutral-400 dark:text-neutral-600">
                Voclara
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-8">
              <Link to="/about" className="font-bold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors uppercase tracking-widest text-sm">About</Link>
              <Link to="/terms" className="font-bold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors uppercase tracking-widest text-sm">Terms</Link>
              <Link to="/privacy" className="font-bold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors uppercase tracking-widest text-sm">Privacy</Link>
              <Link to="/support" className="font-bold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors uppercase tracking-widest text-sm">Support</Link>
            </div>
          </div>
          <div className="text-center text-sm font-bold text-neutral-400 border-t border-neutral-200 dark:border-neutral-800 pt-8 uppercase tracking-widest">
            © 2026 Voclara. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
