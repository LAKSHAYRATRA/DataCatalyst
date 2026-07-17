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

            if (parseFloat(downloadSpeed) >= 10) {
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
                <h3 className="text-3xl font-bold text-neutral-900 mb-3">Internet Speed Test</h3>
                <p className="text-lg text-neutral-600">Testing your connection speed...</p>
            </div>

            {internetStatus === 'checking' && (
                <div className="flex flex-col items-center space-y-6">
                    <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                        <div className="card-hover text-center">
                            <div className="text-sm text-neutral-600 mb-1">Download</div>
                            <div className="text-2xl font-bold text-primary-600">{speed.download || '...'}</div>
                            <div className="text-xs text-neutral-500">Mbps</div>
                        </div>
                        <div className="card-hover text-center">
                            <div className="text-sm text-neutral-600 mb-1">Upload</div>
                            <div className="text-2xl font-bold text-primary-600">{speed.upload || '...'}</div>
                            <div className="text-xs text-neutral-500">Mbps</div>
                        </div>
                    </div>
                </div>
            )}

            {internetStatus === 'success' && (
                <div className="text-center animate-scale-in">
                    <div className="w-16 h-16 bg-success-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h4 className="text-xl font-semibold text-success-700 mb-4">Connection Excellent!</h4>
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                        <div className="bg-success-50 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-success-700">{speed.download}</div>
                            <div className="text-sm text-success-600">Download (Mbps)</div>
                        </div>
                        <div className="bg-success-50 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-success-700">{speed.upload}</div>
                            <div className="text-sm text-success-600">Upload (Mbps)</div>
                        </div>
                    </div>
                </div>
            )}

            {internetStatus === 'failed' && (
                <div className="text-center">
                    <div className="w-16 h-16 bg-error-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-error-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </div>
                    <h4 className="text-xl font-semibold text-error-700 mb-4">Connection Too Slow</h4>
                    <button onClick={startTest} className="btn btn-error">Retry Test</button>
                </div>
            )}
        </div>
    );
}
