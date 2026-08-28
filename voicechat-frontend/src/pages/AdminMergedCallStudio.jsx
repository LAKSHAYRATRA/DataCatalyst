import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminNav from "../components/AdminNav.jsx";
import MergedCallStudio from "../components/MergedCallStudio.jsx";

export default function AdminMergedCallStudio() {
    const { callId } = useParams();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex">
            <AdminNav />
            <div className="flex-1 md:ml-64 min-w-0 flex flex-col min-h-screen">
                <MergedCallStudio 
                    callId={callId} 
                    onClose={() => navigate(-1)} 
                    isModal={false} 
                />
            </div>
        </div>
    );
}
