import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPostJson, apiPutJson, apiDeleteJson } from "../lib/api.js";
import AdminNav from "../components/AdminNav.jsx";

export default function AdminTopics() {
    const navigate = useNavigate();
    const [topics, setTopics] = useState([]);
    const [systemLanguages, setSystemLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("active"); // "active" | "disabled"
    const [showTopicModal, setShowTopicModal] = useState(false);
    const [showSubtopicModal, setShowSubtopicModal] = useState(false);
    const [editingTopic, setEditingTopic] = useState(null);
    const [editingSubtopic, setEditingSubtopic] = useState(null);
    const [selectedTopicForSubtopic, setSelectedTopicForSubtopic] = useState(null);
    const [expandedTopics, setExpandedTopics] = useState(new Set());
    const [expandedInstructions, setExpandedInstructions] = useState(new Set());

    // Form states
    const [topicForm, setTopicForm] = useState({ title: "", description: "", isEnabled: true, languages: [] });
    const [subtopicForm, setSubtopicForm] = useState({ title: "", description: "", instructions: "", maxCalls: 3, isEnabled: true });

    useEffect(() => {
        loadTopics();
        loadLanguages();
    }, []);

    async function loadLanguages() {
        try {
            const data = await apiGet("/api/languages");
            setSystemLanguages(data.languages || []);
        } catch (e) {
            console.error("Failed to load languages:", e);
        }
    }

    async function loadTopics() {
        try {
            setLoading(true);
            const data = await apiGet("/api/admin/topics");
            const loadedTopics = data.topics || [];
            setTopics(loadedTopics);

            // Auto-expand all topics so subtopics are immediately visible
            const topicIds = new Set(loadedTopics.map(t => t._id));
            setExpandedTopics(topicIds);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Forbidden") || e.message.includes("Unauthorized")) {
                navigate("/login");
            }
        } finally {
            setLoading(false);
        }
    }

    // Helper functions to categorize active vs disabled subtopics
    function isSubtopicActive(sub) {
        const limit = sub.maxCalls !== undefined ? Number(sub.maxCalls) : 3;
        const approved = Number(sub.approvedCount || 0);
        return Boolean(sub.isEnabled) && approved < limit;
    }

    function isSubtopicDisabled(sub) {
        return !isSubtopicActive(sub);
    }

    // Inline Limit Editing with instant reactivation / completion shift
    async function updateSubtopicLimit(subtopic, newLimitVal) {
        const parsedVal = parseInt(newLimitVal, 10);
        const newLimit = isNaN(parsedVal) ? 0 : Math.max(0, parsedVal);
        const approved = Number(subtopic.approvedCount || 0);
        
        // Auto-enable if admin sets limit higher than approved count on a disabled subtopic
        const shouldEnable = newLimit > approved ? true : subtopic.isEnabled;

        try {
            const res = await apiPutJson(`/api/admin/subtopics/${subtopic._id}`, {
                maxCalls: newLimit,
                isEnabled: shouldEnable
            });

            const updatedSub = res.subtopic || { ...subtopic, maxCalls: newLimit, isEnabled: shouldEnable };

            setTopics(prevTopics => prevTopics.map(t => ({
                ...t,
                subtopics: (t.subtopics || []).map(s => s._id === subtopic._id ? { ...s, ...updatedSub } : s)
            })));
        } catch (e) {
            alert("Error updating limit: " + e.message);
        }
    }

    // Quick toggle for Pause vs Activate
    async function toggleSubtopicEnabled(subtopic) {
        try {
            let newEnabled = !subtopic.isEnabled;
            let newMaxCalls = subtopic.maxCalls !== undefined ? Number(subtopic.maxCalls) : 3;
            const approved = Number(subtopic.approvedCount || 0);

            // If reactivating a topic whose limit is already reached/exceeded, auto-bump limit to approved + 1
            if (newEnabled && approved >= newMaxCalls) {
                newMaxCalls = approved + 1;
            }

            const res = await apiPutJson(`/api/admin/subtopics/${subtopic._id}`, {
                isEnabled: newEnabled,
                maxCalls: newMaxCalls
            });

            const updatedSub = res.subtopic || { ...subtopic, isEnabled: newEnabled, maxCalls: newMaxCalls };

            setTopics(prevTopics => prevTopics.map(t => ({
                ...t,
                subtopics: (t.subtopics || []).map(s => s._id === subtopic._id ? { ...s, ...updatedSub } : s)
            })));
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    // Topic CRUD
    function openTopicModal(topic = null) {
        if (topic) {
            setEditingTopic(topic);
            setTopicForm({ title: topic.title, description: topic.description || "", isEnabled: topic.isEnabled, languages: topic.languages || [] });
        } else {
            setEditingTopic(null);
            setTopicForm({ title: "", description: "", isEnabled: true, languages: [] });
        }
        setShowTopicModal(true);
    }

    async function saveTopic() {
        try {
            if (editingTopic) {
                await apiPutJson(`/api/admin/topics/${editingTopic._id}`, topicForm);
            } else {
                await apiPostJson("/api/admin/topics", topicForm);
            }
            setShowTopicModal(false);
            loadTopics();
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    async function deleteTopic(topicId) {
        if (!confirm("Delete this topic and all its subtopics?")) return;
        try {
            await apiDeleteJson(`/api/admin/topics/${topicId}`);
            loadTopics();
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    // Subtopic CRUD
    function openSubtopicModal(topic, subtopic = null) {
        setSelectedTopicForSubtopic(topic);
        if (subtopic) {
            setEditingSubtopic(subtopic);
            setSubtopicForm({ 
                title: subtopic.title, 
                description: subtopic.description || "", 
                instructions: subtopic.instructions || "",
                maxCalls: subtopic.maxCalls !== undefined ? subtopic.maxCalls : 3,
                isEnabled: subtopic.isEnabled 
            });
        } else {
            setEditingSubtopic(null);
            setSubtopicForm({ title: "", description: "", instructions: "", maxCalls: 3, isEnabled: true });
        }
        setShowSubtopicModal(true);
    }

    async function saveSubtopic() {
        try {
            if (editingSubtopic) {
                await apiPutJson(`/api/admin/subtopics/${editingSubtopic._id}`, subtopicForm);
            } else {
                await apiPostJson(`/api/admin/topics/${selectedTopicForSubtopic._id}/subtopics`, subtopicForm);
            }
            setShowSubtopicModal(false);
            loadTopics();
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    async function deleteSubtopic(subtopicId) {
        if (!confirm("Delete this subtopic?")) return;
        try {
            await apiDeleteJson(`/api/admin/subtopics/${subtopicId}`);
            loadTopics();
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    async function toggleTopicEnabled(topic) {
        try {
            await apiPutJson(`/api/admin/topics/${topic._id}`, { ...topic, isEnabled: !topic.isEnabled });
            loadTopics();
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    function toggleTopicExpanded(topicId) {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            if (newSet.has(topicId)) {
                newSet.delete(topicId);
            } else {
                newSet.add(topicId);
            }
            return newSet;
        });
    }

    function toggleInstructionExpanded(subtopicId) {
        setExpandedInstructions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(subtopicId)) {
                newSet.delete(subtopicId);
            } else {
                newSet.add(subtopicId);
            }
            return newSet;
        });
    }

    // Compute tab statistics and filter displayed items
    let totalActiveSubtopics = 0;
    let totalDisabledSubtopics = 0;

    topics.forEach(t => {
        (t.subtopics || []).forEach(s => {
            if (isSubtopicActive(s)) totalActiveSubtopics++;
            else totalDisabledSubtopics++;
        });
    });

    const processedTopics = topics.map(t => {
        const allSubs = t.subtopics || [];
        const activeSubs = allSubs.filter(isSubtopicActive);
        const disabledSubs = allSubs.filter(isSubtopicDisabled);

        return {
            ...t,
            displaySubtopics: activeTab === "active" ? activeSubs : disabledSubs,
            activeCount: activeSubs.length,
            disabledCount: disabledSubs.length,
            totalSubCount: allSubs.length
        };
    }).filter(t => {
        if (activeTab === "active") {
            // Show topic if it's enabled AND has active subtopics (or is a newly created empty topic)
            return t.isEnabled && (t.displaySubtopics.length > 0 || t.totalSubCount === 0);
        } else {
            // Show topic if it's disabled OR has disabled/completed subtopics
            return !t.isEnabled || t.displaySubtopics.length > 0;
        }
    });

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4 border-b border-neutral-800 pb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center gap-3">
                            Topics Management
                        </h1>
                        <p className="text-sm md:text-base text-neutral-400">
                            Configure conversation topics, adjust call limits, and manage active pipeline status
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                        {/* Tab Toggle: Active vs Disabled Topics */}
                        <div className="flex items-center bg-neutral-800 p-1.5 rounded-xl border border-neutral-700">
                            <button
                                onClick={() => setActiveTab("active")}
                                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 ${
                                    activeTab === "active"
                                        ? "bg-warning-600 text-white shadow-md"
                                        : "text-neutral-400 hover:text-white hover:bg-neutral-700"
                                }`}
                            >
                                <span>Active Topics</span>
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${activeTab === "active" ? "bg-black/30 text-white" : "bg-neutral-900 text-warning-400"}`}>
                                    {totalActiveSubtopics}
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveTab("disabled")}
                                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 ${
                                    activeTab === "disabled"
                                        ? "bg-neutral-700 text-white shadow-md border border-neutral-600"
                                        : "text-neutral-400 hover:text-white hover:bg-neutral-700"
                                }`}
                            >
                                <span>Disabled Topics</span>
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${activeTab === "disabled" ? "bg-black/30 text-white" : "bg-neutral-900 text-neutral-400"}`}>
                                    {totalDisabledSubtopics}
                                </span>
                            </button>
                        </div>

                        <button
                            onClick={() => openTopicModal()}
                            className="px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-lg font-medium transition-all text-sm flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                            </svg>
                            Add Topic
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-error-900/50 border border-error-700 text-error-300 px-4 py-3 rounded-lg mb-6 text-sm md:text-base">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-600 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {processedTopics.map((topic) => (
                            <div key={topic._id} className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden shadow-sm">
                                {/* Topic Header */}
                                <div className="p-4 md:p-6">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-3">
                                        <div className="flex items-center space-x-2 md:space-x-3 flex-1 w-full sm:w-auto flex-wrap">
                                            {/* Accordion Toggle Button */}
                                            <button
                                                onClick={() => toggleTopicExpanded(topic._id)}
                                                className="p-1 hover:bg-neutral-700 rounded transition-colors flex-shrink-0"
                                            >
                                                <svg
                                                    className={`w-5 h-5 text-neutral-400 transition-transform ${expandedTopics.has(topic._id) ? 'rotate-90' : ''}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                                                </svg>
                                            </button>

                                            <h3 className="text-lg md:text-xl font-bold text-white break-words">{topic.title}</h3>
                                            
                                            <button
                                                onClick={() => toggleTopicEnabled(topic)}
                                                className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex-shrink-0 ${topic.isEnabled
                                                    ? 'bg-success-950 text-success-400 border border-success-900/50'
                                                    : 'bg-neutral-900 text-neutral-500 border border-neutral-700'
                                                    }`}
                                            >
                                                {topic.isEnabled ? 'Enabled' : 'Disabled'}
                                            </button>

                                            <span className="text-xs text-neutral-400 whitespace-nowrap bg-neutral-900/60 px-2 py-0.5 rounded border border-neutral-700">
                                                {activeTab === "active" ? `${topic.activeCount} active subtopics` : `${topic.disabledCount} disabled subtopics`}
                                            </span>

                                            {topic.languages && topic.languages.length > 0 && (
                                                <span className="text-xs text-primary-400 font-bold ml-1">[{topic.languages.join(", ")}]</span>
                                            )}
                                        </div>
                                        <div className="flex items-center space-x-2 w-full sm:w-auto">
                                            <button
                                                onClick={() => openSubtopicModal(topic)}
                                                className="flex-1 sm:flex-none px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg text-xs md:text-sm font-semibold transition-all"
                                            >
                                                + Subtopic
                                            </button>
                                            <button
                                                onClick={() => openTopicModal(topic)}
                                                className="flex-1 sm:flex-none px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-warning-400 rounded-lg text-xs md:text-sm font-semibold transition-all"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => deleteTopic(topic._id)}
                                                className="flex-1 sm:flex-none px-3 py-1.5 bg-error-950 hover:bg-error-900 text-error-400 rounded-lg text-xs md:text-sm font-semibold transition-all border border-error-900/40"
                                            >
                                                Del
                                            </button>
                                        </div>
                                    </div>
                                    {topic.description && (
                                        <p className="text-neutral-400 text-xs md:text-sm ml-0 md:ml-9 break-words whitespace-pre-wrap">{topic.description}</p>
                                    )}
                                </div>

                                {/* Subtopics - Accordion Content */}
                                {expandedTopics.has(topic._id) && (
                                    <div className="border-t border-neutral-700 bg-neutral-900/50 p-4 md:p-6">
                                        <div className="text-xs md:text-sm font-bold text-neutral-400 mb-3 flex items-center justify-between">
                                            <span>Subtopics in {activeTab === "active" ? "Active Pipeline" : "Disabled / Completed Archive"} ({topic.displaySubtopics.length})</span>
                                        </div>

                                        {topic.displaySubtopics.length === 0 ? (
                                            <div className="text-center py-6 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-xs text-neutral-500 italic">
                                                No {activeTab} subtopics in this category.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-3">
                                                {topic.displaySubtopics.map((subtopic) => {
                                                    const limit = subtopic.maxCalls !== undefined ? Number(subtopic.maxCalls) : 3;
                                                    const approved = Number(subtopic.approvedCount || 0);
                                                    const pending = Number(subtopic.pendingCount || 0);
                                                    const isDone = approved >= limit;

                                                    return (
                                                        <div key={subtopic._id} className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 md:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                            <div className="flex-1 w-full">
                                                                <div className="flex items-center space-x-2 mb-2 flex-wrap gap-y-1">
                                                                    <div className="text-white font-bold text-sm md:text-base break-words mr-1">{subtopic.title}</div>
                                                                    
                                                                    {/* Status Badges */}
                                                                    {subtopic.isEnabled && !isDone && (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-950 text-green-400 border border-green-900/30">
                                                                            Active Pipeline
                                                                        </span>
                                                                    )}
                                                                    {subtopic.isEnabled && isDone && (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-neutral-400 border border-neutral-700">
                                                                            Completed (Done {approved}/{limit})
                                                                        </span>
                                                                    )}
                                                                    {!subtopic.isEnabled && (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950/80 text-red-400 border border-red-900/50">
                                                                            Paused / Disabled
                                                                        </span>
                                                                    )}

                                                                    {/* Quick Pause / Activate Button */}
                                                                    <button
                                                                        onClick={() => toggleSubtopicEnabled(subtopic)}
                                                                        className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold flex-shrink-0 transition-colors ${
                                                                            subtopic.isEnabled && !isDone
                                                                                ? 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
                                                                                : 'bg-warning-600 hover:bg-warning-700 text-white shadow-sm'
                                                                        }`}
                                                                        title={subtopic.isEnabled && !isDone ? "Pause this subtopic" : "Activate subtopic into user queue"}
                                                                    >
                                                                        {subtopic.isEnabled && !isDone ? 'Pause' : 'Activate'}
                                                                    </button>

                                                                    {/* Stats Counter */}
                                                                    <span className="text-[11px] text-neutral-400 font-medium px-2 py-0.5 bg-neutral-900/80 rounded border border-neutral-700">
                                                                        Approved: <strong className="text-success-400">{approved}</strong> | Pending: <strong className="text-warning-400">{pending}</strong>
                                                                    </span>

                                                                    {/* Dynamic Limit Control Box */}
                                                                    <div className="flex items-center gap-1.5 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700 text-[11px] text-neutral-400 font-medium">
                                                                        <label htmlFor={`limit_${subtopic._id}`} className="text-neutral-300 font-bold">Limit:</label>
                                                                        <input
                                                                            id={`limit_${subtopic._id}`}
                                                                            type="number"
                                                                            min="0"
                                                                            value={subtopic.maxCalls !== undefined ? subtopic.maxCalls : 3}
                                                                            onChange={(e) => updateSubtopicLimit(subtopic, e.target.value)}
                                                                            className="w-14 px-1.5 py-0.5 bg-neutral-800 border border-neutral-600 rounded text-center text-white font-bold focus:outline-none focus:border-warning-500 text-xs"
                                                                            title="Modify limit. Setting limit > approved count instantly reactivates topic into active pipeline!"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {subtopic.description && (
                                                                    <div className="text-xs text-neutral-400 break-words whitespace-pre-wrap mb-1">{subtopic.description}</div>
                                                                )}
                                                                {subtopic.instructions && (
                                                                    <div className="mt-1">
                                                                        <div className={`text-xs text-warning-400/90 break-words italic ${!expandedInstructions.has(subtopic._id) ? 'line-clamp-2' : ''}`}>
                                                                            Instructions: {subtopic.instructions}
                                                                        </div>
                                                                        {subtopic.instructions.length > 100 && (
                                                                            <button
                                                                                onClick={() => toggleInstructionExpanded(subtopic._id)}
                                                                                className="text-[10px] text-warning-400 hover:text-warning-300 font-bold mt-0.5 uppercase tracking-tighter"
                                                                            >
                                                                                {expandedInstructions.has(subtopic._id) ? 'Show Less' : 'Show More'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center space-x-1 w-full sm:w-auto">
                                                                <button
                                                                    onClick={() => openSubtopicModal(topic, subtopic)}
                                                                    className="flex-1 sm:flex-none p-2 text-warning-400 hover:bg-neutral-700 rounded transition-colors"
                                                                    title="Edit subtopic details"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteSubtopic(subtopic._id)}
                                                                    className="flex-1 sm:flex-none p-2 text-error-400 hover:bg-neutral-700 rounded transition-colors"
                                                                    title="Delete subtopic"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {processedTopics.length === 0 && (
                            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-8 md:p-12 text-center">
                                <div className="text-neutral-400 mb-4 text-sm md:text-base font-medium">
                                    No {activeTab} topics found.
                                </div>
                                <button
                                    onClick={() => openTopicModal()}
                                    className="px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-lg font-medium transition-all"
                                >
                                    Create New Topic
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Topic Modal */}
            {showTopicModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setShowTopicModal(false)}>
                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl max-w-md w-full p-4 md:p-6 max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">{editingTopic ? 'Edit Topic' : 'Add Topic'}</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-neutral-300 mb-2">Title</label>
                                <input
                                    type="text"
                                    value={topicForm.title}
                                    onChange={(e) => setTopicForm({ ...topicForm, title: e.target.value })}
                                    className="w-full px-4 py-2 md:py-3 text-sm md:text-base rounded-lg border border-neutral-600 bg-neutral-700 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                    placeholder="e.g., Technology"
                                />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-neutral-300 mb-2">Description (Optional)</label>
                                <textarea
                                    value={topicForm.description}
                                    onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
                                    className="w-full px-4 py-2 md:py-3 text-sm md:text-base rounded-lg border border-neutral-600 bg-neutral-700 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-warning-500 resize-none"
                                    rows="3"
                                    placeholder="Brief description..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-neutral-300 mb-2">Regional Language Filters (Optional)</label>
                                <p className="text-xs text-neutral-500 mb-3">If no languages are selected, this topic applies globally to all calls.</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[150px] overflow-y-auto bg-neutral-800 border border-neutral-700 p-3 rounded-lg">
                                    {systemLanguages.map((lang) => (
                                        <div key={lang.code} className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id={`lang_${lang.code}`}
                                                checked={topicForm.languages?.includes(lang.code) || false}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setTopicForm(prev => {
                                                        const prevLangs = prev.languages || [];
                                                        if (checked) return { ...prev, languages: [...prevLangs, lang.code] };
                                                        return { ...prev, languages: prevLangs.filter(l => l !== lang.code) };
                                                    });
                                                }}
                                                className="w-4 h-4 text-warning-600 bg-neutral-700 border-neutral-600 rounded focus:ring-warning-500"
                                            />
                                            <label htmlFor={`lang_${lang.code}`} className="text-xs md:text-sm text-neutral-300 cursor-pointer">{lang.name}</label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="topicEnabled"
                                    checked={topicForm.isEnabled}
                                    onChange={(e) => setTopicForm({ ...topicForm, isEnabled: e.target.checked })}
                                    className="w-4 h-4 text-warning-600 bg-neutral-700 border-neutral-600 rounded focus:ring-warning-500"
                                />
                                <label htmlFor="topicEnabled" className="text-xs md:text-sm text-neutral-300">Enabled</label>
                            </div>
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
                                <button
                                    onClick={saveTopic}
                                    className="flex-1 px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-lg font-medium transition-all text-sm md:text-base"
                                >
                                    {editingTopic ? 'Update' : 'Create'}
                                </button>
                                <button
                                    onClick={() => setShowTopicModal(false)}
                                    className="flex-1 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg font-medium transition-all text-sm md:text-base"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Subtopic Modal */}
            {showSubtopicModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setShowSubtopicModal(false)}>
                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl max-w-md w-full p-4 md:p-6 max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{editingSubtopic ? 'Edit Subtopic' : 'Add Subtopic'}</h2>
                        <p className="text-neutral-400 text-xs md:text-sm mb-4 md:mb-6 break-words">Topic: {selectedTopicForSubtopic?.title}</p>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-neutral-300 mb-2">Title</label>
                                <input
                                    type="text"
                                    value={subtopicForm.title}
                                    onChange={(e) => setSubtopicForm({ ...subtopicForm, title: e.target.value })}
                                    className="w-full px-4 py-2 md:py-3 text-sm md:text-base rounded-lg border border-neutral-600 bg-neutral-700 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                    placeholder="e.g., Artificial Intelligence"
                                />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-neutral-300 mb-2">Description (Optional)</label>
                                <textarea
                                    value={subtopicForm.description}
                                    onChange={(e) => setSubtopicForm({ ...subtopicForm, description: e.target.value })}
                                    className="w-full px-4 py-2 md:py-3 text-sm md:text-base rounded-lg border border-neutral-600 bg-neutral-700 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-warning-500 resize-none"
                                    rows="2"
                                    placeholder="Brief description..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-neutral-300 mb-2">Instructions (Optional)</label>
                                <textarea
                                    value={subtopicForm.instructions}
                                    onChange={(e) => setSubtopicForm({ ...subtopicForm, instructions: e.target.value })}
                                    className="w-full px-4 py-2 md:py-3 text-sm md:text-base rounded-lg border border-neutral-600 bg-neutral-700 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-warning-500 resize-none"
                                    rows="4"
                                    placeholder="Specific instructions for this subtopic..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs md:text-sm font-medium text-neutral-300 mb-2">Max Calls Allowed</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={subtopicForm.maxCalls}
                                    onChange={(e) => setSubtopicForm({ ...subtopicForm, maxCalls: parseInt(e.target.value) || 1 })}
                                    className="w-full px-4 py-2 md:py-3 text-sm md:text-base rounded-lg border border-neutral-600 bg-neutral-700 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                />
                                <p className="text-xs text-neutral-500 mt-1">Number of completed calls before this subtopic is removed (default 3).</p>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="subtopicEnabled"
                                    checked={subtopicForm.isEnabled}
                                    onChange={(e) => setSubtopicForm({ ...subtopicForm, isEnabled: e.target.checked })}
                                    className="w-4 h-4 text-warning-600 bg-neutral-700 border-neutral-600 rounded focus:ring-warning-500"
                                />
                                <label htmlFor="subtopicEnabled" className="text-xs md:text-sm text-neutral-300">Enabled</label>
                            </div>
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
                                <button
                                    onClick={saveSubtopic}
                                    className="flex-1 px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-lg font-medium transition-all text-sm md:text-base"
                                >
                                    {editingSubtopic ? 'Update' : 'Create'}
                                </button>
                                <button
                                    onClick={() => setShowSubtopicModal(false)}
                                    className="flex-1 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg font-medium transition-all text-sm md:text-base"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
