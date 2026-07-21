import React, { useState, useEffect } from 'react';

export default function InternetTest({ onSuccess, onRetry }) {
    const [internetStatus, setInternetStatus] = useState('idle');
    const [speed, setSpeed] = useState({ download: null, upload: null });

    useEffect(() => {
        if (internetStatus === 'idle') {
            startTest();
        }
    }, []);

    const startTest = async () => {
        setInternetStatus('checking');
        setSpeed({ download: '...', upload: '...' });

        try {
            const downloadUrl = 'https://speed.cloudflare.com/__down?bytes=5000000';
            const startTimeDl = Date.now();
            const response = await fetch(downloadUrl);
            await response.blob();
            const endTimeDl = Date.now();

            const durationDl = (endTimeDl - startTimeDl) / 1000;
            const bitsLoaded = 5000000 * 8;
            const downloadSpeed = (bitsLoaded / durationDl / 1000000).toFixed(1);

            setSpeed(prev => ({ ...prev, download: downloadSpeed }));

            const uploadSize = 2 * 1024 * 1024;
            const dummyData = new Uint8Array(uploadSize);
            const uploadBlob = new Blob([dummyData]);

            const startTimeUl = Date.now();
            await fetch('https://speed.cloudflare.com/__up', {
                method: 'POST',
                body: uploadBlob
            });
            const endTimeUl = Date.now();

            const durationUl = (endTimeUl - startTimeUl) / 1000;
            const bitsUploaded = uploadSize * 8;
            const uploadSpeed = (bitsUploaded / durationUl / 1000000).toFixed(1);

            setSpeed({ download: downloadSpeed, upload: uploadSpeed });

            if (parseFloat(downloadSpeed) >= 20 && parseFloat(uploadSpeed) >= 20) {
                setInternetStatus('success');
                setTimeout(() => onSuccess(), 2000);
            } else {
                setInternetStatus('failed');
            }
        } catch (error) {
            console.error("Speed Test Failed:", error);
            setInternetStatus('failed');
            setSpeed({ download: 'Error', upload: 'Error' });
        }
    };

    return (
        <div className="py-12 animate-slide-up w-full">
            <div className="text-center mb-10">
                <h3 className="text-3xl font-bold text-neutral-900 dark:text-white mb-3">Internet Speed Test</h3>
                <p className="text-lg text-neutral-600 dark:text-neutral-400">Testing your connection speed...</p>
            </div>

            {internetStatus === 'checking' && (
                <div className="flex flex-col items-center space-y-6">
                    <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                        <div className="card-hover text-center">
                            <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Download</div>
                            <div className="text-2xl font-bold text-primary-600">{speed.download || '...'}</div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">Mbps</div>
                        </div>
                        <div className="card-hover text-center">
                            <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">Upload</div>
                            <div className="text-2xl font-bold text-primary-600">{speed.upload || '...'}</div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">Mbps</div>
                        </div>
                    </div>
                </div>
            )}

            {internetStatus === 'success' && (
                <div className="text-center animate-scale-in">
                    <div className="w-16 h-16 bg-success-100 dark:bg-success-950/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-success-600 dark:text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h4 className="text-xl font-semibold text-success-700 dark:text-success-500 mb-4">Connection Excellent!</h4>
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                        <div className="bg-success-50 dark:bg-success-950/20 border border-success-100 dark:border-success-900/50 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-success-700 dark:text-success-400">{speed.download}</div>
                            <div className="text-sm text-success-600 dark:text-success-300">Download (Mbps)</div>
                        </div>
                        <div className="bg-success-50 dark:bg-success-950/20 border border-success-100 dark:border-success-900/50 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-success-700 dark:text-success-400">{speed.upload}</div>
                            <div className="text-sm text-success-600 dark:text-success-300">Upload (Mbps)</div>
                        </div>
                    </div>
                </div>
            )}

            {internetStatus === 'failed' && (
                <div className="text-center animate-scale-in">
                    <div className="w-16 h-16 bg-error-100 dark:bg-error-950/30 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-error-600 dark:text-error-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </div>
                    <h4 className="text-xl font-semibold text-error-700 dark:text-error-400 mb-6">Slow internet speed, redo the internet check</h4>
                    
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-8">
                        <div className={`p-4 rounded-lg border transition-colors duration-300 ${parseFloat(speed.download) < 20 || isNaN(parseFloat(speed.download)) ? 'bg-error-50 dark:bg-error-950/20 border-error-100 dark:border-error-900/50' : 'bg-success-50 dark:bg-success-950/20 border-success-100 dark:border-success-900/50'}`}>
                            <div className={`text-3xl font-bold ${parseFloat(speed.download) < 20 || isNaN(parseFloat(speed.download)) ? 'text-error-700 dark:text-error-400' : 'text-success-700 dark:text-success-400'}`}>{speed.download}</div>
                            <div className={`text-sm font-medium ${parseFloat(speed.download) < 20 || isNaN(parseFloat(speed.download)) ? 'text-error-600 dark:text-error-300' : 'text-success-600 dark:text-success-300'}`}>Download (Mbps)</div>
                            {(parseFloat(speed.download) < 20 || isNaN(parseFloat(speed.download))) && <div className="text-xs text-error-500 font-semibold mt-1">Below 20 Mbps</div>}
                        </div>
                        <div className={`p-4 rounded-lg border transition-colors duration-300 ${parseFloat(speed.upload) < 20 || isNaN(parseFloat(speed.upload)) ? 'bg-error-50 dark:bg-error-950/20 border-error-100 dark:border-error-900/50' : 'bg-success-50 dark:bg-success-950/20 border-success-100 dark:border-success-900/50'}`}>
                            <div className={`text-3xl font-bold ${parseFloat(speed.upload) < 20 || isNaN(parseFloat(speed.upload)) ? 'text-error-700 dark:text-error-400' : 'text-success-700 dark:text-success-400'}`}>{speed.upload}</div>
                            <div className={`text-sm font-medium ${parseFloat(speed.upload) < 20 || isNaN(parseFloat(speed.upload)) ? 'text-error-600 dark:text-error-300' : 'text-success-600 dark:text-success-300'}`}>Upload (Mbps)</div>
                            {(parseFloat(speed.upload) < 20 || isNaN(parseFloat(speed.upload))) && <div className="text-xs text-error-500 font-semibold mt-1">Below 20 Mbps</div>}
                        </div>
                    </div>

                    <button onClick={startTest} className="btn btn-error px-8 py-3.5 font-bold rounded-xl shadow-md hover:shadow-lg transition-all">Redo Internet Check</button>
                </div>
            )}
        </div>
    );
}
