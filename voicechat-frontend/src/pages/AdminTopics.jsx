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
    const [showTopicModal, setShowTopicModal] = useState(false);
    const [showSubtopicModal, setShowSubtopicModal] = useState(false);
    const [editingTopic, setEditingTopic] = useState(null);
    const [editingSubtopic, setEditingSubtopic] = useState(null);
    const [selectedTopicForSubtopic, setSelectedTopicForSubtopic] = useState(null);
    const [expandedTopics, setExpandedTopics] = useState(new Set());
    const [expandedInstructions, setExpandedInstructions] = useState(new Set());

    // Form states
    const [topicForm, setTopicForm] = useState({ title: "", description: "", isEnabled: true, languages: [] });
    const [subtopicForm, setSubtopicForm] = useState({ title: "", description: "", instructions: "", isEnabled: true });

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
            setTopics(data.topics);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Forbidden") || e.message.includes("Unauthorized")) {
                navigate("/login");
            }
        } finally {
            setLoading(false);
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
                isEnabled: subtopic.isEnabled 
            });
        } else {
            setEditingSubtopic(null);
            setSubtopicForm({ title: "", description: "", instructions: "", isEnabled: true });
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

    async function toggleSubtopicEnabled(subtopic) {
        try {
            await apiPutJson(`/api/admin/subtopics/${subtopic._id}`, { ...subtopic, isEnabled: !subtopic.isEnabled });
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

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 md:mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Topics Management</h1>
                        <p className="text-sm md:text-base text-neutral-400">Manage conversation topics and subtopics</p>
                    </div>
                    <button
                        onClick={() => openTopicModal()}
                        className="px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-lg font-medium transition-all text-sm md:text-base w-full sm:w-auto"
                    >
                        <svg className="w-5 h-5 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                        </svg>
                        Add Topic
                    </button>
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
                        {topics.map((topic) => (
                            <div key={topic._id} className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                                {/* Topic Header */}
                                <div className="p-4 md:p-6">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
                                        <div className="flex items-center space-x-2 md:space-x-3 flex-1 w-full sm:w-auto">
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
                                                className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${topic.isEnabled
                                                    ? 'bg-success-900/50 text-success-300'
                                                    : 'bg-neutral-700 text-neutral-400'
                                                    }`}
                                            >
                                                {topic.isEnabled ? 'On' : 'Off'}
                                            </button>
                                            {topic.subtopics && topic.subtopics.length > 0 && (
                                                <span className="text-xs md:text-sm text-neutral-500 whitespace-nowrap">({topic.subtopics.length})</span>
                                            )}
                                            {topic.languages && topic.languages.length > 0 && (
                                                <span className="text-xs text-primary-400 font-bold ml-2">[{topic.languages.join(", ")}]</span>
                                            )}
                                        </div>
                                        <div className="flex items-center space-x-2 w-full sm:w-auto">
                                            <button
                                                onClick={() => openSubtopicModal(topic)}
                                                className="flex-1 sm:flex-none px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg text-xs md:text-sm transition-all"
                                            >
                                                +Sub
                                            </button>
                                            <button
                                                onClick={() => openTopicModal(topic)}
                                                className="flex-1 sm:flex-none px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-warning-400 rounded-lg text-xs md:text-sm transition-all"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => deleteTopic(topic._id)}
                                                className="flex-1 sm:flex-none px-3 py-2 bg-error-900/50 hover:bg-error-900 text-error-300 rounded-lg text-xs md:text-sm transition-all"
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
                                {expandedTopics.has(topic._id) && topic.subtopics && topic.subtopics.length > 0 && (
                                    <div className="border-t border-neutral-700 bg-neutral-900/50 p-4 md:p-6 animate-slide-down">
                                        <div className="text-xs md:text-sm font-medium text-neutral-400 mb-3">Subtopics ({topic.subtopics.length})</div>
                                        <div className="grid grid-cols-1 gap-3">
                                            {topic.subtopics.map((subtopic) => (
                                                <div key={subtopic._id} className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 md:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                    <div className="flex-1 w-full">
                                                        <div className="flex items-center space-x-2 mb-1 flex-wrap">
                                                            <div className="text-white font-medium text-sm md:text-base break-words">{subtopic.title}</div>
                                                            <button
                                                                onClick={() => toggleSubtopicEnabled(subtopic)}
                                                                className={`px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${subtopic.isEnabled
                                                                    ? 'bg-success-900/50 text-success-300'
                                                                    : 'bg-neutral-700 text-neutral-500'
                                                                    }`}
                                                            >
                                                                {subtopic.isEnabled ? 'On' : 'Off'}
                                                            </button>
                                                        </div>
                                                        {subtopic.description && (
                                                            <div className="text-xs text-neutral-500 break-words whitespace-pre-wrap">{subtopic.description}</div>
                                                        )}
                                                        {subtopic.instructions && (
                                                            <div className="mt-1">
                                                                <div className={`text-xs text-warning-500/80 break-words italic ${!expandedInstructions.has(subtopic._id) ? 'line-clamp-2' : ''}`}>
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
                                                            className="flex-1 sm:flex-none p-2 text-warning-400 hover:bg-neutral-700 rounded"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => deleteSubtopic(subtopic._id)}
                                                            className="flex-1 sm:flex-none p-2 text-error-400 hover:bg-neutral-700 rounded"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {topics.length === 0 && (
                            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-8 md:p-12 text-center">
                                <div className="text-neutral-500 mb-4 text-sm md:text-base">No topics yet</div>
                                <button
                                    onClick={() => openTopicModal()}
                                    className="px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-lg font-medium transition-all"
                                >
                                    Create First Topic
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
