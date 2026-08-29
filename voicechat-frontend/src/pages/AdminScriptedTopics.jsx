import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { 
    Radio, 
    Plus, 
    CheckCircle2, 
    XCircle, 
    Edit2, 
    Trash2, 
    ChevronDown, 
    ChevronRight, 
    FileText, 
    Layers, 
    RefreshCw, 
    AlertCircle, 
    Sliders, 
    Globe, 
    Check, 
    X, 
    Upload, 
    MessageSquare, 
    Users, 
    Sparkles, 
    Eye,
    ArrowLeft,
    FolderKanban
} from "lucide-react";
import { apiGet, apiPostJson, apiPutJson, apiDeleteJson } from "../lib/api.js";
import AdminNav from "../components/AdminNav.jsx";
import Swal from "sweetalert2";

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function AdminScriptedTopics() {
    const navigate = useNavigate();
    const { langCode, subprojectCode } = useParams();
    const [topics, setTopics] = useState([]);
    const [scriptedLanguages, setScriptedLanguages] = useState([]);
    const [subprojectDetails, setSubprojectDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("active"); // "active" | "disabled"
    const [showTopicModal, setShowTopicModal] = useState(false);
    const [showSubtopicModal, setShowSubtopicModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [editingTopic, setEditingTopic] = useState(null);
    const [editingSubtopic, setEditingSubtopic] = useState(null);
    const [selectedTopicForSubtopic, setSelectedTopicForSubtopic] = useState(null);
    const [expandedTopics, setExpandedTopics] = useState(new Set());
    const [expandedDialogue, setExpandedDialogue] = useState(new Set());

    // Inline Limit Editing
    const [editingLimitId, setEditingLimitId] = useState(null);
    const [tempLimitValue, setTempLimitValue] = useState("");
    const [isSavingLimit, setIsSavingLimit] = useState(false);

    // Form states
    const [topicForm, setTopicForm] = useState({ title: "", description: "", frequency: 3, isEnabled: true, languages: [] });
    const [subtopicForm, setSubtopicForm] = useState({
        title: "",
        description: "",
        instructions: "",
        rawScript: "",
        speaker1Gender: "any",
        speaker2Gender: "any",
        maxCalls: 3,
        isEnabled: true
    });

    // Bulk upload form state
    const [bulkTopicId, setBulkTopicId] = useState("");
    const [bulkRawText, setBulkRawText] = useState("");
    const [bulkDefaultSpeaker1Gender, setBulkDefaultSpeaker1Gender] = useState("any");
    const [bulkDefaultSpeaker2Gender, setBulkDefaultSpeaker2Gender] = useState("any");
    const [bulkDefaultMaxCalls, setBulkDefaultMaxCalls] = useState(3);
    const [bulkUploading, setBulkUploading] = useState(false);

    useEffect(() => {
        loadTopics();
        loadLanguages();
    }, [langCode, subprojectCode]);

    async function loadLanguages() {
        try {
            const data = await apiGet("/api/admin/scripted-languages");
            const list = data.languages || [];
            const activeLangs = list.filter(l => l.enabled);
            setScriptedLanguages(activeLangs);

            if (subprojectCode) {
                const found = list.find(l => l.code.toLowerCase() === subprojectCode.toLowerCase());
                if (found) setSubprojectDetails(found);
            }
        } catch (e) {
            console.error("Failed to load scripted languages:", e);
        }
    }

    async function loadTopics() {
        try {
            setLoading(true);
            const queryUrl = subprojectCode ? `/api/admin/scripted-topics?subproject=${encodeURIComponent(subprojectCode)}` : "/api/admin/scripted-topics";
            const data = await apiGet(queryUrl);
            const loadedTopics = data.topics || [];
            setTopics(loadedTopics);

            // Auto-expand all topics
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

    // Parse "Speaker 1 || Speaker 2" formatted text into turns
    function parseScriptLines(text) {
        if (!text || typeof text !== "string") return [];
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        const turns = [];
        let order = 1;
        for (const line of lines) {
            if (line.includes("||")) {
                const parts = line.split("||");
                const spk1 = (parts[0] || "").trim();
                const spk2 = (parts.slice(1).join("||") || "").trim();
                if (spk1 || spk2) {
                    turns.push({ order: order++, speaker1: spk1, speaker2: spk2 });
                }
            } else if (line.toLowerCase().startsWith("speaker 1:") || line.toLowerCase().startsWith("speaker1:")) {
                const spk1 = line.replace(/^speaker\s*1\s*:\s*/i, "").trim();
                turns.push({ order: order++, speaker1: spk1, speaker2: "" });
            } else if (line.toLowerCase().startsWith("speaker 2:") || line.toLowerCase().startsWith("speaker2:")) {
                if (turns.length > 0 && !turns[turns.length - 1].speaker2) {
                    turns[turns.length - 1].speaker2 = line.replace(/^speaker\s*2\s*:\s*/i, "").trim();
                } else {
                    turns.push({ order: order++, speaker1: "", speaker2: line.replace(/^speaker\s*2\s*:\s*/i, "").trim() });
                }
            }
        }
        return turns;
    }

    function isSubtopicActive(sub) {
        const limit = sub.maxCalls !== undefined ? Number(sub.maxCalls) : 3;
        const approved = Number(sub.approvedCount || 0);
        return Boolean(sub.isEnabled) && approved < limit;
    }

    function isSubtopicDisabled(sub) {
        return !isSubtopicActive(sub);
    }

    const startEditingLimit = (e, sub) => {
        e.stopPropagation();
        setEditingLimitId(sub._id);
        setTempLimitValue(String(sub.maxCalls !== undefined ? sub.maxCalls : 3));
    };

    const cancelEditingLimit = (e) => {
        if (e) e.stopPropagation();
        setEditingLimitId(null);
        setTempLimitValue("");
    };

    const saveInlineLimit = async (e, sub) => {
        if (e) e.stopPropagation();
        const newLimit = parseInt(tempLimitValue, 10);
        if (isNaN(newLimit) || newLimit < 1) {
            Swal.fire({
                icon: 'warning',
                title: 'Invalid Frequency',
                text: 'Target recording frequency must be at least 1.',
                confirmButtonColor: '#6366f1'
            });
            return;
        }

        try {
            setIsSavingLimit(true);
            const updated = await apiPutJson(`/api/admin/scripted-subtopics/${sub._id}`, {
                frequency: newLimit,
                maxCalls: newLimit
            });

            setTopics(prev => prev.map(t => ({
                ...t,
                subtopics: t.subtopics.map(s => s._id === sub._id ? { ...s, ...updated.subtopic } : s)
            })));

            setEditingLimitId(null);
            setTempLimitValue("");
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Update Failed',
                text: err.message,
                confirmButtonColor: '#6366f1'
            });
        } finally {
            setIsSavingLimit(false);
        }
    };

    const handleTopicSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingTopic) {
                await apiPutJson(`/api/admin/scripted-topics/${editingTopic._id}`, topicForm);
            } else {
                await apiPostJson("/api/admin/scripted-topics", topicForm);
            }
            setShowTopicModal(false);
            setEditingTopic(null);
            setTopicForm({ title: "", description: "", frequency: 3, isEnabled: true, languages: [] });
            loadTopics();
        } catch (e) {
            setError(e.message);
        }
    };

    const handleSubtopicSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...subtopicForm,
                dialogueTurns: parseScriptLines(subtopicForm.rawScript)
            };

            if (editingSubtopic) {
                await apiPutJson(`/api/admin/scripted-subtopics/${editingSubtopic._id}`, payload);
            } else {
                let targetTopicId = selectedTopicForSubtopic?._id;
                if (!targetTopicId) {
                    if (topics.length > 0) {
                        targetTopicId = topics[0]._id;
                    } else {
                        // Auto-create default topic for this subproject/language
                        const defaultTitle = subprojectDetails?.projectName || subprojectDetails?.name || (langCode ? `${capitalize(langCode)} Conversations` : "General Conversations");
                        const newTopicRes = await apiPostJson("/api/admin/scripted-topics", {
                            title: defaultTitle,
                            description: `Conversations for ${defaultTitle}`,
                            frequency: payload.maxCalls || 3,
                            isEnabled: true,
                            languages: subprojectCode ? [subprojectCode] : []
                        });
                        targetTopicId = newTopicRes.topic?._id;
                    }
                }
                await apiPostJson(`/api/admin/scripted-topics/${targetTopicId}/subtopics`, payload);
            }
            setShowSubtopicModal(false);
            setEditingSubtopic(null);
            setSelectedTopicForSubtopic(null);
            setSubtopicForm({ title: "", description: "", instructions: "", rawScript: "", maxCalls: 3, isEnabled: true });
            loadTopics();
            Swal.fire({
                icon: 'success',
                title: 'Conversation Added',
                text: 'Scripted conversation successfully created!',
                confirmButtonColor: '#6366f1'
            });
        } catch (e) {
            setError(e.message);
            Swal.fire('Error', e.message, 'error');
        }
    };

    // Parse bulk text into multiple scenarios
    // Format:
    // ### Scenario 1 Title
    // Hello || Hi
    // How are you || Doing well
    //
    // ### Scenario 2 Title
    // Where is the bank || Down the road
    const handleBulkSubmit = async (e) => {
        e.preventDefault();
        if (!bulkRawText.trim()) {
            Swal.fire('Content Required', 'Please enter or paste your conversation scripts.', 'warning');
            return;
        }

        try {
            setBulkUploading(true);
            let targetTopicId = bulkTopicId;
            if (!targetTopicId) {
                if (topics.length > 0) {
                    targetTopicId = topics[0]._id;
                } else {
                    // Auto-create default topic for this subproject/language
                    const defaultTitle = subprojectDetails?.projectName || subprojectDetails?.name || (langCode ? `${capitalize(langCode)} Conversations` : "General Conversations");
                    const newTopicRes = await apiPostJson("/api/admin/scripted-topics", {
                        title: defaultTitle,
                        description: `Conversations for ${defaultTitle}`,
                        frequency: bulkDefaultMaxCalls || 3,
                        isEnabled: true,
                        languages: subprojectCode ? [subprojectCode] : []
                    });
                    targetTopicId = newTopicRes.topic?._id;
                }
            }

            const blocks = bulkRawText.split(/(?:^|\n)###\s+/).map(b => b.trim()).filter(Boolean);
            const scenarios = [];

            if (blocks.length === 1 && !bulkRawText.includes("###")) {
                // Single scenario without title header
                const lines = bulkRawText.split("\n").map(l => l.trim()).filter(Boolean);
                const title = lines[0]?.replace(/^#+\s*/, '') || "Untitled Scenario";
                const scriptLines = lines.slice(1).join("\n") || lines.join("\n");
                scenarios.push({
                    title,
                    rawScript: scriptLines,
                    speaker1Gender: bulkDefaultSpeaker1Gender,
                    speaker2Gender: bulkDefaultSpeaker2Gender,
                    maxCalls: bulkDefaultMaxCalls,
                    isEnabled: true
                });
            } else {
                for (const block of blocks) {
                    const lines = block.split("\n");
                    const title = lines[0].trim();
                    const scriptLines = lines.slice(1).join("\n").trim();
                    if (title) {
                        scenarios.push({
                            title,
                            rawScript: scriptLines,
                            speaker1Gender: bulkDefaultSpeaker1Gender,
                            speaker2Gender: bulkDefaultSpeaker2Gender,
                            maxCalls: bulkDefaultMaxCalls,
                            isEnabled: true
                        });
                    }
                }
            }

            if (scenarios.length === 0) {
                Swal.fire('No Valid Scenarios', 'Could not parse scenarios from input.', 'warning');
                return;
            }

            const res = await apiPostJson(`/api/admin/scripted-topics/${targetTopicId}/bulk-subtopics`, {
                scenarios
            });

            setShowBulkModal(false);
            setBulkRawText("");
            loadTopics();
            Swal.fire({
                icon: 'success',
                title: 'Conversations Imported',
                text: `Successfully imported ${res.count || scenarios.length} scripted conversation(s)!`,
                confirmButtonColor: '#6366f1'
            });
        } catch (err) {
            Swal.fire('Upload Error', err.message, 'error');
        } finally {
            setBulkUploading(false);
        }
    };

    const deleteTopic = async (topicId) => {
        const result = await Swal.fire({
            title: 'Delete Scripted Topic?',
            text: 'This will permanently delete this scripted topic and all associated script scenarios.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e11d48',
            cancelButtonColor: '#4b5563',
            confirmButtonText: 'Yes, Delete'
        });

        if (!result.isConfirmed) return;

        try {
            await apiDeleteJson(`/api/admin/scripted-topics/${topicId}`);
            loadTopics();
            Swal.fire('Deleted', 'Scripted topic has been removed.', 'success');
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        }
    };

    const deleteSubtopic = async (subtopicId) => {
        const result = await Swal.fire({
            title: 'Delete Script Scenario?',
            text: 'Are you sure you want to remove this scenario?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e11d48',
            cancelButtonColor: '#4b5563',
            confirmButtonText: 'Yes, Delete'
        });

        if (!result.isConfirmed) return;

        try {
            await apiDeleteJson(`/api/admin/scripted-subtopics/${subtopicId}`);
            loadTopics();
            Swal.fire('Deleted', 'Scenario has been removed.', 'success');
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        }
    };

    const toggleTopic = (topicId) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            if (next.has(topicId)) next.delete(topicId);
            else next.add(topicId);
            return next;
        });
    };

    const toggleDialogue = (subtopicId) => {
        setExpandedDialogue(prev => {
            const next = new Set(prev);
            if (next.has(subtopicId)) next.delete(subtopicId);
            else next.add(subtopicId);
            return next;
        });
    };

    const expandAll = () => {
        const allIds = new Set(topics.map(t => t._id));
        setExpandedTopics(allIds);
    };

    const collapseAll = () => {
        setExpandedTopics(new Set());
    };

    // Filter topics according to activeTab
    const displayedTopics = topics.map(topic => {
        const filteredSubs = (topic.subtopics || []).filter(sub => 
            activeTab === "active" ? isSubtopicActive(sub) : isSubtopicDisabled(sub)
        );
        return { ...topic, subtopics: filteredSubs };
    }).filter(topic => topic.subtopics.length > 0 || (activeTab === "active" && topic.isEnabled));

    const totalActiveSubtopics = topics.reduce((acc, t) => acc + (t.subtopics || []).filter(isSubtopicActive).length, 0);
    const totalDisabledSubtopics = topics.reduce((acc, t) => acc + (t.subtopics || []).filter(isSubtopicDisabled).length, 0);

    const activeTurnsPreview = parseScriptLines(subtopicForm.rawScript);

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex">
            <AdminNav />
            <div className="flex-1 md:ml-64 p-6 md:p-8 min-w-0 max-w-7xl mx-auto space-y-6">

                {/* Breadcrumb if navigating through Language & Subproject */}
                {langCode && subprojectCode && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 pb-3 border-b border-neutral-800/80">
                        <Link to="/admin/scripted-topics" className="hover:text-indigo-400 flex items-center gap-1">
                            <Radio className="w-3.5 h-3.5" />
                            <span>Scripted Call Topics</span>
                        </Link>
                        <span>/</span>
                        <Link to={`/admin/scripted-topics/${encodeURIComponent(langCode)}/subprojects`} className="hover:text-indigo-400 flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5" />
                            <span>{capitalize(langCode)}</span>
                        </Link>
                        <span>/</span>
                        <span className="text-white flex items-center gap-1">
                            <FolderKanban className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{subprojectDetails?.projectName || subprojectDetails?.name || subprojectCode}</span>
                        </span>
                        <span>/</span>
                        <span className="text-indigo-400">Topics</span>
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
                    <div>
                        <div className="flex items-center gap-2.5 mb-1">
                            <Link to={langCode ? `/admin/scripted-topics/${encodeURIComponent(langCode)}/subprojects` : "/admin/scripted-topics"} className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors mr-1">
                                <ArrowLeft className="w-4 h-4" />
                            </Link>
                            <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-primary-600 text-white shadow-lg shadow-indigo-500/20">
                                <Radio className="w-5 h-5" />
                            </div>
                            <h1 className="text-2xl font-bold">
                                {subprojectDetails ? `${subprojectDetails.projectName || subprojectDetails.name} Scripted Topics` : "Scripted Call Topics"}
                            </h1>
                            <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                                2-Person Script Engine
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            {subprojectDetails ? `Upload and manage 2-person dialogues and quota targets for ${subprojectDetails.name}` : "Upload and manage 2-person dialogues separated by || for dual-contributor recorded verses."}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                setBulkTopicId(topics[0]?._id || "");
                                setBulkRawText("");
                                setShowBulkModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm border border-neutral-700 transition-all cursor-pointer shadow-sm"
                        >
                            <Upload className="w-4 h-4 text-indigo-400" />
                            <span>Bulk Upload Scripts</span>
                        </button>
                        <button
                            onClick={() => {
                                setSelectedTopicForSubtopic(topics[0] || null);
                                setEditingSubtopic(null);
                                setSubtopicForm({
                                    title: "",
                                    description: "",
                                    instructions: "",
                                    rawScript: "",
                                    speaker1Gender: "any",
                                    speaker2Gender: "any",
                                    maxCalls: topics[0]?.frequency || 3,
                                    isEnabled: true
                                });
                                setShowSubtopicModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Scripted Conversation</span>
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="p-4 rounded-xl bg-rose-900/30 border border-rose-700/50 text-rose-300 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Tabs & Controls */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-800/60 border border-neutral-700/70 p-4 rounded-2xl">
                    <div className="flex bg-neutral-900/80 p-1 rounded-xl border border-neutral-700">
                        <button
                            onClick={() => setActiveTab("active")}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                                activeTab === "active" ? "bg-primary-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                            }`}
                        >
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Active Conversations ({totalActiveSubtopics})</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("disabled")}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                                activeTab === "disabled" ? "bg-primary-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                            }`}
                        >
                            <span className="w-2 h-2 rounded-full bg-neutral-500" />
                            <span>Completed / Disabled ({totalDisabledSubtopics})</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={expandAll}
                            className="px-3 py-1.5 rounded-lg bg-neutral-900/80 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-300"
                        >
                            Expand All
                        </button>
                        <button
                            onClick={collapseAll}
                            className="px-3 py-1.5 rounded-lg bg-neutral-900/80 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-300"
                        >
                            Collapse All
                        </button>
                        <button
                            onClick={loadTopics}
                            disabled={loading}
                            className="p-2 rounded-lg bg-neutral-900/80 hover:bg-neutral-700 border border-neutral-700 text-neutral-300"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Topics Accordion List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
                        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-sm font-semibold">Loading Scripted Conversations...</p>
                    </div>
                ) : displayedTopics.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/40 p-8">
                        <Radio className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                        <h3 className="text-base font-bold text-neutral-300">
                            {activeTab === "active" ? "No Active Scripted Conversations" : "No Completed Conversations"}
                        </h3>
                        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto mb-5">
                            {activeTab === "active" 
                                ? "Add your 2-person scripted conversation dialogues separated by || to start recording." 
                                : "Completed scripted scenarios with reached quotas will appear here."}
                        </p>
                        {activeTab === "active" && (
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    onClick={() => {
                                        setBulkTopicId(topics[0]?._id || "");
                                        setBulkRawText("");
                                        setShowBulkModal(true);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs border border-neutral-700 cursor-pointer shadow-sm"
                                >
                                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Bulk Upload Scripts</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedTopicForSubtopic(topics[0] || null);
                                        setEditingSubtopic(null);
                                        setSubtopicForm({
                                            title: "",
                                            description: "",
                                            instructions: "",
                                            rawScript: "",
                                            speaker1Gender: "any",
                                            speaker2Gender: "any",
                                            maxCalls: 3,
                                            isEnabled: true
                                        });
                                        setShowSubtopicModal(true);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-indigo-600/30"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Scripted Conversation</span>
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {displayedTopics.map((topic) => {
                            const isExpanded = expandedTopics.has(topic._id);
                            return (
                                <div
                                    key={topic._id}
                                    className="bg-neutral-800/50 border border-neutral-700/80 rounded-2xl overflow-hidden shadow-lg transition-all"
                                >
                                    {/* Topic Header Card */}
                                    <div 
                                        onClick={() => toggleTopic(topic._id)}
                                        className="p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-neutral-800/80 select-none transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="p-1 rounded-lg bg-neutral-700/60 text-neutral-300">
                                                {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-bold text-white text-base">{topic.title}</h3>
                                                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                                        topic.isEnabled ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/60" : "bg-neutral-700 text-neutral-400"
                                                    }`}>
                                                        {topic.isEnabled ? "Active" : "Disabled"}
                                                    </span>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 font-mono">
                                                        Target Freq: {topic.frequency || 3} pairs
                                                    </span>
                                                    <span className="text-xs text-neutral-400 font-semibold">
                                                        ({topic.subtopics?.length || 0} Scenarios)
                                                    </span>
                                                </div>
                                                {topic.description && (
                                                    <p className="text-xs text-neutral-400 mt-1 line-clamp-1">
                                                        {topic.description}
                                                    </p>
                                                )}

                                                {/* Language Tags */}
                                                {topic.languages && topic.languages.length > 0 && (
                                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                        <Globe className="w-3 h-3 text-neutral-500" />
                                                        {topic.languages.map(lang => (
                                                            <span key={lang} className="text-[10px] px-2 py-0.5 bg-neutral-900 text-primary-300 font-bold rounded border border-neutral-700 capitalize">
                                                                {lang}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => {
                                                    setSelectedTopicForSubtopic(topic);
                                                    setEditingSubtopic(null);
                                                    setSubtopicForm({
                                                        title: "",
                                                        description: "",
                                                        instructions: "",
                                                        rawScript: "",
                                                        speaker1Gender: "any",
                                                        speaker2Gender: "any",
                                                        maxCalls: topic.frequency || 3,
                                                        isEnabled: true
                                                    });
                                                    setShowSubtopicModal(true);
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-xs font-bold transition-all"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                <span>Add Scenario</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingTopic(topic);
                                                    setTopicForm({
                                                        title: topic.title,
                                                        description: topic.description || "",
                                                        frequency: topic.frequency || 3,
                                                        isEnabled: topic.isEnabled !== undefined ? topic.isEnabled : true,
                                                        languages: topic.languages || []
                                                    });
                                                    setShowTopicModal(true);
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                                                title="Edit Topic & Frequency"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteTopic(topic._id)}
                                                className="p-1.5 rounded-lg hover:bg-rose-900/40 text-neutral-400 hover:text-rose-400 transition-colors"
                                                title="Delete Topic"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Subtopics Expansion */}
                                    {isExpanded && (
                                        <div className="border-t border-neutral-700/60 bg-neutral-900/50 p-4 space-y-3">
                                            {(!topic.subtopics || topic.subtopics.length === 0) ? (
                                                <div className="text-center py-6 text-neutral-500 text-xs font-semibold">
                                                    No scenarios in this category. Click "Add Scenario" above or use "Bulk Upload Scripts".
                                                </div>
                                            ) : (
                                                topic.subtopics.map((sub) => {
                                                    const isDialogueOpen = expandedDialogue.has(sub._id);
                                                    const approved = sub.approvedCount || 0;
                                                    const limit = sub.maxCalls !== undefined ? sub.maxCalls : 3;
                                                    const turns = (sub.dialogueTurns && sub.dialogueTurns.length > 0)
                                                        ? sub.dialogueTurns
                                                        : parseScriptLines(sub.rawScript || sub.instructions || "");

                                                    return (
                                                        <div
                                                            key={sub._id}
                                                            className="p-4 rounded-xl bg-neutral-800/80 border border-neutral-700/60 flex flex-col gap-3"
                                                        >
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <h4 className="font-bold text-white text-sm">{sub.title}</h4>
                                                                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                                                            sub.calculatedStatus === "enabled" 
                                                                                ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/60"
                                                                                : sub.calculatedStatus === "froze"
                                                                                ? "bg-amber-900/60 text-amber-300 border border-amber-700/60"
                                                                                : "bg-neutral-700 text-neutral-400"
                                                                        }`}>
                                                                            {sub.calculatedStatus || "enabled"}
                                                                        </span>

                                                                        {turns.length > 0 && (
                                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 flex items-center gap-1">
                                                                                <MessageSquare className="w-2.5 h-2.5" />
                                                                                <span>{turns.length} Turns</span>
                                                                            </span>
                                                                        )}

                                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 capitalize">
                                                                            S1: {sub.speaker1Gender || "Any"}
                                                                        </span>
                                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 capitalize">
                                                                            S2: {sub.speaker2Gender || "Any"}
                                                                        </span>
                                                                    </div>
                                                                    {sub.description && (
                                                                        <p className="text-xs text-neutral-400 mt-0.5">{sub.description}</p>
                                                                    )}
                                                                </div>

                                                                {/* Limit & Actions */}
                                                                <div className="flex items-center gap-3">
                                                                    {/* Inline Frequency Editor */}
                                                                    <div className="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 rounded-xl border border-neutral-700 text-xs font-mono" title="Target recording frequency across distinct speaker pairs">
                                                                        <span className="text-neutral-400">Freq:</span>
                                                                        <span className="text-emerald-400 font-bold">{approved}</span>
                                                                        <span className="text-neutral-600">/</span>
                                                                        {editingLimitId === sub._id ? (
                                                                            <div className="flex items-center gap-1">
                                                                                <input
                                                                                    type="number"
                                                                                    min="1"
                                                                                    value={tempLimitValue}
                                                                                    onChange={(e) => setTempLimitValue(e.target.value)}
                                                                                    className="w-12 px-1 py-0.5 bg-neutral-800 border border-indigo-500 rounded text-center text-xs text-white"
                                                                                    autoFocus
                                                                                />
                                                                                <button
                                                                                    onClick={(e) => saveInlineLimit(e, sub)}
                                                                                    disabled={isSavingLimit}
                                                                                    className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                                                                                >
                                                                                    <Check className="w-3 h-3" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={cancelEditingLimit}
                                                                                    className="p-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
                                                                                >
                                                                                    <X className="w-3 h-3" />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                onClick={(e) => startEditingLimit(e, sub)}
                                                                                title="Click to edit target recording frequency"
                                                                                className="font-bold text-white hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                                                                            >
                                                                                <span>{limit}</span>
                                                                                <Edit2 className="w-2.5 h-2.5 opacity-60" />
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedTopicForSubtopic(topic);
                                                                            setEditingSubtopic(sub);
                                                                            setSubtopicForm({
                                                                                title: sub.title,
                                                                                description: sub.description || "",
                                                                                instructions: sub.instructions || "",
                                                                                rawScript: sub.rawScript || (sub.dialogueTurns || []).map(t => `${t.speaker1} || ${t.speaker2}`).join("\n"),
                                                                                speaker1Gender: sub.speaker1Gender || "any",
                                                                                speaker2Gender: sub.speaker2Gender || "any",
                                                                                maxCalls: sub.frequency || sub.maxCalls || 3,
                                                                                isEnabled: sub.isEnabled !== undefined ? sub.isEnabled : true
                                                                            });
                                                                            setShowSubtopicModal(true);
                                                                        }}
                                                                        className="p-1.5 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                                                                        title="Edit Scenario & Genders"
                                                                    >
                                                                        <Edit2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteSubtopic(sub._id)}
                                                                        className="p-1.5 rounded-lg hover:bg-rose-900/40 text-neutral-400 hover:text-rose-400 transition-colors"
                                                                        title="Delete Scenario"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Dialogue Conversation Preview Button */}
                                                            {turns.length > 0 && (
                                                                <div className="pt-2 border-t border-neutral-700/50">
                                                                    <button
                                                                        onClick={() => toggleDialogue(sub._id)}
                                                                        className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer"
                                                                    >
                                                                        <Eye className="w-3.5 h-3.5" />
                                                                        <span>{isDialogueOpen ? "Hide 2-Person Script Dialogue" : `View 2-Person Script Dialogue (${turns.length} Turns)`}</span>
                                                                    </button>

                                                                    {isDialogueOpen && (
                                                                        <div className="mt-3 space-y-2.5 p-3.5 bg-neutral-900/90 border border-neutral-700/70 rounded-xl">
                                                                            {turns.map((turn, idx) => (
                                                                                <div key={idx} className="space-y-1.5 text-xs">
                                                                                    <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-neutral-500 uppercase">
                                                                                        <span>Turn {idx + 1}</span>
                                                                                    </div>
                                                                                    {/* Speaker 1 verse */}
                                                                                    {turn.speaker1 && (
                                                                                        <div className="flex items-start gap-2 max-w-xl">
                                                                                            <span className="px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-bold text-[10px] border border-blue-700/50 shrink-0">
                                                                                                Speaker 1
                                                                                            </span>
                                                                                            <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-800/40 text-blue-100 font-sans leading-relaxed flex-1">
                                                                                                {turn.speaker1}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                    {/* Speaker 2 verse */}
                                                                                    {turn.speaker2 && (
                                                                                        <div className="flex items-start gap-2 max-w-xl ml-auto">
                                                                                            <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-100 font-sans leading-relaxed flex-1 text-right">
                                                                                                {turn.speaker2}
                                                                                            </div>
                                                                                            <span className="px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-bold text-[10px] border border-emerald-700/50 shrink-0">
                                                                                                Speaker 2
                                                                                            </span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Topic Modal */}
                {showTopicModal && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
                            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Radio className="w-5 h-5 text-indigo-400" />
                                    <h2 className="text-lg font-bold text-white">
                                        {editingTopic ? "Edit Scripted Topic" : "Add Scripted Topic"}
                                    </h2>
                                </div>
                                <button onClick={() => setShowTopicModal(false)} className="text-neutral-400 hover:text-white p-1 rounded-lg">
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={handleTopicSubmit} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Topic Title
                                    </label>
                                    <input
                                        type="text"
                                        value={topicForm.title}
                                        onChange={(e) => setTopicForm({ ...topicForm, title: e.target.value })}
                                        placeholder="e.g. Banking Inquiries, Medical Consultations"
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Description (Optional)
                                    </label>
                                    <textarea
                                        value={topicForm.description}
                                        onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
                                        placeholder="Brief overview of conversational theme..."
                                        rows={2}
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                </div>

                                {/* Target Frequency in Topic Modal */}
                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5 flex items-center justify-between">
                                        <span>Target Recording Frequency (Distinct Speaker Pairs)</span>
                                        <span className="text-indigo-400 font-mono font-bold text-xs">{topicForm.frequency || 3} times</span>
                                    </label>
                                    <p className="text-[11px] text-neutral-400 mb-2">
                                        How many times this topic/scenarios should be recorded by different speaker pairs. Speakers who complete it are never shown it again.
                                    </p>
                                    <input
                                        type="number"
                                        min="1"
                                        value={topicForm.frequency || 3}
                                        onChange={(e) => setTopicForm({ ...topicForm, frequency: Number(e.target.value) })}
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                                    />
                                </div>

                                {/* Language Selector */}
                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Assign to Scripted Languages (Optional)
                                    </label>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2.5 bg-neutral-800/80 border border-neutral-700 rounded-xl">
                                        {scriptedLanguages.length === 0 ? (
                                            <span className="text-xs text-neutral-500">No active scripted languages found.</span>
                                        ) : (
                                            scriptedLanguages.map((lang) => {
                                                const isSelected = topicForm.languages.includes(lang.code);
                                                return (
                                                    <button
                                                        key={lang.code}
                                                        type="button"
                                                        onClick={() => {
                                                            const newLangs = isSelected
                                                                ? topicForm.languages.filter(c => c !== lang.code)
                                                                : [...topicForm.languages, lang.code];
                                                            setTopicForm({ ...topicForm, languages: newLangs });
                                                        }}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all capitalize flex items-center gap-1.5 ${
                                                            isSelected 
                                                                ? "bg-indigo-600 text-white shadow-sm" 
                                                                : "bg-neutral-700/60 text-neutral-300 hover:bg-neutral-700"
                                                        }`}
                                                    >
                                                        {isSelected && <Check className="w-3 h-3" />}
                                                        <span>{lang.name}</span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                    <p className="text-[11px] text-neutral-500 mt-1">
                                        Leave empty to make topic available across all scripted languages.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                    <input
                                        type="checkbox"
                                        id="topicEnabled"
                                        checked={topicForm.isEnabled}
                                        onChange={(e) => setTopicForm({ ...topicForm, isEnabled: e.target.checked })}
                                        className="rounded bg-neutral-800 border-neutral-600 text-indigo-600 focus:ring-0 cursor-pointer"
                                    />
                                    <label htmlFor="topicEnabled" className="text-xs font-bold text-neutral-300 cursor-pointer">
                                        Enable this scripted topic immediately
                                    </label>
                                </div>

                                <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowTopicModal(false)}
                                        className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all"
                                    >
                                        {editingTopic ? "Save Topic" : "Create Topic"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Subtopic / 2-Person Scenario Modal */}
                {showSubtopicModal && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
                            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-5 h-5 text-indigo-400" />
                                        <h2 className="text-lg font-bold text-white">
                                            {editingSubtopic ? "Edit Scripted Conversation" : "Add Scripted Conversation"}
                                        </h2>
                                    </div>
                                    <p className="text-xs text-neutral-400 mt-0.5">
                                        {subprojectDetails?.projectName || subprojectDetails?.name || "2-Person Dialogue Engine"}
                                    </p>
                                </div>
                                <button onClick={() => setShowSubtopicModal(false)} className="text-neutral-400 hover:text-white p-1 rounded-lg cursor-pointer">
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={handleSubtopicSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                                {topics.length > 1 && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                            Topic / Category (Optional)
                                        </label>
                                        <select
                                            value={selectedTopicForSubtopic?._id || topics[0]?._id || ""}
                                            onChange={(e) => {
                                                const found = topics.find(t => t._id === e.target.value);
                                                setSelectedTopicForSubtopic(found || null);
                                            }}
                                            className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                                        >
                                            {topics.map(t => (
                                                <option key={t._id} value={t._id}>{t.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Conversation / Scenario Title
                                    </label>
                                    <input
                                        type="text"
                                        value={subtopicForm.title}
                                        onChange={(e) => setSubtopicForm({ ...subtopicForm, title: e.target.value })}
                                        placeholder="e.g. Card Blocking Inquiry, Grocery Delivery Check, Doctor Booking"
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Description (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={subtopicForm.description}
                                        onChange={(e) => setSubtopicForm({ ...subtopicForm, description: e.target.value })}
                                        placeholder="Brief scenario summary or context for contributors..."
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                </div>

                                {/* 2-Person Dialogue Script Input separated by || */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-bold uppercase text-neutral-400">
                                            2-Person Conversation Dialogue (<code className="text-indigo-400 font-mono lowercase">speaker 1 || speaker 2</code>)
                                        </label>
                                        <span className="text-[11px] font-bold text-indigo-400">
                                            {activeTurnsPreview.length} Turn(s) Detected
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-neutral-400 mb-2">
                                        Enter each conversation turn on a new line separated by <code className="bg-neutral-800 px-1 py-0.5 rounded text-white font-mono">||</code>.
                                    </p>
                                    <textarea
                                        value={subtopicForm.rawScript}
                                        onChange={(e) => setSubtopicForm({ ...subtopicForm, rawScript: e.target.value })}
                                        placeholder={`Hello, how are you || Hi, im good\nWhat can I do for you today? || I need to open a new savings account\nSure, do you have your ID proof? || Yes, I have my Aadhaar card ready`}
                                        rows={6}
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
                                    />
                                </div>

                                {/* Live 2-Person Chat Preview */}
                                {activeTurnsPreview.length > 0 && (
                                    <div className="p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-xl space-y-2">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                                            Live Script Turn Preview
                                        </span>
                                        {activeTurnsPreview.map((turn, i) => (
                                            <div key={i} className="text-xs space-y-1">
                                                <div className="text-[10px] text-neutral-500 font-mono font-bold">Turn {i+1}</div>
                                                <div className="flex items-start gap-1.5">
                                                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/40">S1</span>
                                                    <span className="text-blue-200">{turn.speaker1 || "—"}</span>
                                                </div>
                                                <div className="flex items-start gap-1.5">
                                                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/40">S2</span>
                                                    <span className="text-emerald-200">{turn.speaker2 || "—"}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Speaker Genders */}
                                <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5 flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                                            <span>Speaker 1 Gender</span>
                                        </label>
                                        <select
                                            value={subtopicForm.speaker1Gender || "any"}
                                            onChange={(e) => setSubtopicForm({ ...subtopicForm, speaker1Gender: e.target.value })}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-bold capitalize cursor-pointer"
                                        >
                                            <option value="any">Any Gender</option>
                                            <option value="male">Male Only</option>
                                            <option value="female">Female Only</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5 flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                            <span>Speaker 2 Gender</span>
                                        </label>
                                        <select
                                            value={subtopicForm.speaker2Gender || "any"}
                                            onChange={(e) => setSubtopicForm({ ...subtopicForm, speaker2Gender: e.target.value })}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-bold capitalize cursor-pointer"
                                        >
                                            <option value="any">Any Gender</option>
                                            <option value="male">Male Only</option>
                                            <option value="female">Female Only</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Target Recording Frequency (Distinct Speaker Pairs)
                                    </label>
                                    <p className="text-[11px] text-neutral-500 mb-1.5">
                                        How many times this conversation must be recorded by distinct speaker pairs. Speakers who complete it are never shown it again.
                                    </p>
                                    <input
                                        type="number"
                                        min="1"
                                        value={subtopicForm.maxCalls}
                                        onChange={(e) => setSubtopicForm({ ...subtopicForm, maxCalls: Number(e.target.value) })}
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                                    />
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                    <input
                                        type="checkbox"
                                        id="subtopicEnabled"
                                        checked={subtopicForm.isEnabled}
                                        onChange={(e) => setSubtopicForm({ ...subtopicForm, isEnabled: e.target.checked })}
                                        className="rounded bg-neutral-800 border-neutral-600 text-indigo-600 focus:ring-0 cursor-pointer"
                                    />
                                    <label htmlFor="subtopicEnabled" className="text-xs font-bold text-neutral-300 cursor-pointer">
                                        Enable this conversation immediately
                                    </label>
                                </div>

                                <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowSubtopicModal(false)}
                                        className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
                                    >
                                        {editingSubtopic ? "Save Conversation" : "Create Conversation"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Bulk Upload Modal */}
                {showBulkModal && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
                            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Upload className="w-5 h-5 text-indigo-400" />
                                    <h2 className="text-lg font-bold text-white">
                                        Bulk Upload 2-Person Conversation Scripts
                                    </h2>
                                </div>
                                <button onClick={() => setShowBulkModal(false)} className="text-neutral-400 hover:text-white p-1 rounded-lg cursor-pointer">
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={handleBulkSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                                {topics.length > 1 && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                            Target Topic / Category (Optional)
                                        </label>
                                        <select
                                            value={bulkTopicId || topics[0]?._id || ""}
                                            onChange={(e) => setBulkTopicId(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                                        >
                                            {topics.map(t => (
                                                <option key={t._id} value={t._id}>
                                                    {t.title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Default Target Frequency Per Scenario (Distinct Pairs)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={bulkDefaultMaxCalls}
                                        onChange={(e) => setBulkDefaultMaxCalls(Number(e.target.value))}
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-bold uppercase text-neutral-400">
                                            Paste Scenarios & Dialogues (Separated by <code className="text-indigo-400 font-mono">### Scenario Title</code>)
                                        </label>
                                    </div>
                                    <p className="text-[11px] text-neutral-400 mb-2">
                                        Format each dialogue turn with <code className="bg-neutral-800 px-1 py-0.5 rounded text-white font-mono">Speaker 1 || Speaker 2</code>.
                                    </p>
                                    <textarea
                                        value={bulkRawText}
                                        onChange={(e) => setBulkRawText(e.target.value)}
                                        placeholder={`### Hotel Room Reservation\nHello, Grand Hotel, how can I help you? || Hi, I'd like to book a room for this weekend.\nCertainly, for how many guests? || For two adults and one child.\n\n### Doctor Appointment Booking\nGood morning, clinic reception. || Hi, I need to see Dr. Sharma today.\nAre you experiencing any urgent symptoms? || Just mild fever since yesterday.`}
                                        rows={10}
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
                                    />
                                </div>

                                <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowBulkModal(false)}
                                        className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={bulkUploading}
                                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                        <Upload className="w-3.5 h-3.5" />
                                        <span>{bulkUploading ? "Importing..." : "Import Conversations"}</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
