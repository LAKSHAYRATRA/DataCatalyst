import React, { useEffect, useState } from "react";
import AdminNav from "../components/AdminNav.jsx";
import Swal from "sweetalert2";
import { Sliders } from "lucide-react";

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}
const get = (p) => apiFetch(p, { method: "GET" });
const postJson = (p, body) => apiFetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patch = (p, body = {}) => apiFetch(p, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const del = (p) => apiFetch(p, { method: "DELETE" });

/** Convert any string to a clean slug: lowercase, non-alphanum → hyphen */
function toSlug(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function AdminLanguages() {
    const [languages, setLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saving, setSaving] = useState(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingLanguage, setEditingLanguage] = useState(null);
    const [modalName, setModalName] = useState("");
    const [modalHourlyPayout, setModalHourlyPayout] = useState("");
    const [modalSampleRate, setModalSampleRate] = useState("48000");
    const [modalMaxHoursPerContributor, setModalMaxHoursPerContributor] = useState("");
    const [modalMaxDailyCallLimit, setModalMaxDailyCallLimit] = useState("5");
    const [modalNoisy, setModalNoisy] = useState(false);
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState("");

    // Summary & Users Modals State
    const [summaryModalLang, setSummaryModalLang] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryData, setSummaryData] = useState(null);
    const [activeModalType, setActiveModalType] = useState(null); // "summary" | "users"
    const [usersTab, setUsersTab] = useState("approved"); // "approved" | "pending"
    const [usersSearch, setUsersSearch] = useState("");

    async function fetchSummary(lang, modalType = "summary") {
        setSummaryModalLang(lang);
        setActiveModalType(modalType);
        setUsersTab("approved");
        setUsersSearch("");
        setSummaryLoading(true);
        try {
            const data = await get(`/api/admin/languages/${lang._id}/contributors-summary`);
            setSummaryData(data.summary);
        } catch (e) {
            setError("Failed to load contributor summary: " + e.message);
        } finally {
            setSummaryLoading(false);
        }
    }

    function closeSummaryModal() {
        setSummaryModalLang(null);
        setActiveModalType(null);
        setSummaryData(null);
    }

    async function handleRemoveCallContributor(userObj) {
        if (!summaryModalLang) return;
        const langName = summaryModalLang.name || "this language";
        const result = await Swal.fire({
            title: "Remove Contributor?",
            text: `Are you sure you want to remove ${userObj.firstname || userObj.username} from Call Language ${langName}? Doing so will prevent them from making calls in this language and block re-applications until reset.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#dc2626",
            cancelButtonColor: "#475569",
            confirmButtonText: "Yes, Remove Contributor",
            background: "#1f2937",
            color: "#fff"
        });

        if (result.isConfirmed) {
            try {
                await postJson(`/api/admin/languages/${summaryModalLang._id}/remove-contributor`, {
                    userId: userObj._id
                });
                Swal.fire({
                    title: "Removed!",
                    text: `${userObj.firstname || userObj.username} has been removed from Call Language ${langName}.`,
                    icon: "success",
                    background: "#1f2937",
                    color: "#fff"
                });
                fetchSummary(summaryModalLang, activeModalType);
            } catch (e) {
                Swal.fire({
                    title: "Error",
                    text: e.message,
                    icon: "error",
                    background: "#1f2937",
                    color: "#fff"
                });
            }
        }
    }

    async function handleResetCallContributor(userObj) {
        if (!summaryModalLang) return;
        const langName = summaryModalLang.name || "this language";
        const result = await Swal.fire({
            title: "Reset Application?",
            text: `Are you sure you want to reset the call application for ${userObj.firstname || userObj.username} in Call Language ${langName}? This will remove them from the rejected list and allow them to apply again.`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#475569",
            confirmButtonText: "Yes, Reset Application",
            background: "#1f2937",
            color: "#fff"
        });

        if (result.isConfirmed) {
            try {
                await postJson(`/api/admin/languages/${summaryModalLang._id}/reset-contributor`, {
                    userId: userObj._id
                });
                Swal.fire({
                    title: "Reset!",
                    text: `Application for ${userObj.firstname || userObj.username} has been reset. They can now apply again.`,
                    icon: "success",
                    background: "#1f2937",
                    color: "#fff"
                });
                fetchSummary(summaryModalLang, activeModalType);
            } catch (e) {
                Swal.fire({
                    title: "Error",
                    text: e.message,
                    icon: "error",
                    background: "#1f2937",
                    color: "#fff"
                });
            }
        }
    }

    async function handleUpdateCallNoiseGate(userObj, noiseGateDb) {
        if (!summaryModalLang) return;
        try {
            await postJson("/api/admin/contributors/update-noise-gate", {
                userId: userObj._id,
                applicationType: "call",
                languageCode: summaryModalLang.code || summaryModalLang.name,
                noiseGateDb: parseInt(noiseGateDb) || 0
            });
            const Toast = Swal.mixin({
                toast: true,
                position: "top-end",
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true,
                background: "#1f2937",
                color: "#fff"
            });
            const valNum = parseInt(noiseGateDb) || 0;
            Toast.fire({
                icon: "success",
                title: `Noise gate updated to ${valNum === 0 ? "RAW (0 dB)" : valNum + " dB"}`
            });
            fetchSummary(summaryModalLang, activeModalType);
        } catch (e) {
            Swal.fire({
                title: "Error",
                text: e.message,
                icon: "error",
                background: "#1f2937",
                color: "#fff"
            });
        }
    }

    async function openSetCallNoiseGateModal(userObj) {
        if (!summaryModalLang) return;
        const currentVal = userObj.noiseGateDb !== undefined ? userObj.noiseGateDb : 0;
        const langName = summaryModalLang.name || summaryModalLang.code || "Call Language";

        const { value: inputDb } = await Swal.fire({
            title: "Set Custom Noise Gate",
            html: `
                <div class="text-left text-xs text-neutral-300 mb-3 space-y-1.5 bg-neutral-800 p-3 rounded-lg border border-neutral-700">
                    <div><strong class="text-white">Contributor:</strong> ${userObj.firstname} ${userObj.lastname} (@${userObj.username})</div>
                    <div><strong class="text-warning-400">Call Language:</strong> ${langName}</div>
                    <div class="text-neutral-400 text-[11px] pt-1.5 border-t border-neutral-700/60 mt-2">
                        Enter custom noise gate attenuation in dB (e.g. <code>-12</code>, <code>-10</code>, <code>-6</code>, or <code>0</code> for RAW unedited audio). This setting applies <strong>ONLY</strong> to this contributor for <strong>Call Language (${langName})</strong>.
                    </div>
                </div>
            `,
            input: "text",
            inputValue: String(currentVal),
            inputPlaceholder: "Enter dB e.g. -12 or 0",
            showCancelButton: true,
            confirmButtonText: "Apply Noise Gate",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#ea580c",
            cancelButtonColor: "#475569",
            background: "#1f2937",
            color: "#fff",
            inputValidator: (value) => {
                if (value === null || value === undefined || String(value).trim() === "") {
                    return "Please enter a dB number (e.g. -12 or 0)";
                }
                const num = parseInt(value);
                if (isNaN(num)) {
                    return "Please enter a valid integer (e.g. -12, -10, -6, 0)";
                }
                if (num > 0 || num < -60) {
                    return "dB value must be between 0 (RAW) and -60 dB";
                }
                return null;
            }
        });

        if (inputDb !== undefined && inputDb !== null) {
            handleUpdateCallNoiseGate(userObj, inputDb);
        }
    }

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        try {
            const data = await get("/api/admin/languages");
            setLanguages(data.languages || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    function openModal() {
        setEditingLanguage(null);
        setModalName("");
        setModalHourlyPayout("");
        setModalSampleRate("48000");
        setModalMaxHoursPerContributor("");
        setModalMaxDailyCallLimit("5");
        setModalNoisy(false);
        setModalNoisy(false);
        setModalError("");
        setShowModal(true);
    }

    function openEditModal(language) {
        setEditingLanguage(language);
        setModalName(language.name || "");
        setModalHourlyPayout(String(language.hourlyPayout ?? ""));
        setModalSampleRate(String(language.sampleRate ?? 48000));
        setModalMaxHoursPerContributor(
            language.maxHoursPerContributor !== undefined && language.maxHoursPerContributor !== -1
                ? String(language.maxHoursPerContributor)
                : ""
        );
        setModalMaxDailyCallLimit(String(language.maxDailyCallLimit ?? 5));
        setModalNoisy(!!language.noisy);
        setModalError("");
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setEditingLanguage(null);
        setModalName("");
        setModalHourlyPayout("");
        setModalSampleRate("48000");
        setModalMaxHoursPerContributor("");
        setModalMaxDailyCallLimit("5");
        setModalError("");
    }

    async function saveLanguage(e) {
        e.preventDefault();
        const name = modalName.trim();
        const hourlyPayout = Number(modalHourlyPayout);
        const sampleRate = Number(modalSampleRate);
        const maxHours = modalMaxHoursPerContributor.trim() === "" ? -1 : Number(modalMaxHoursPerContributor);
        const maxDailyCallLimit = Number(modalMaxDailyCallLimit);

        if (!name) return setModalError("Language name is required.");
        if (!Number.isFinite(hourlyPayout) || hourlyPayout < 0) return setModalError("A valid hourly payout is required.");
        if (!Number.isFinite(sampleRate) || sampleRate <= 0) return setModalError("A valid sample rate is required.");
        if (modalMaxHoursPerContributor.trim() !== "" && (!Number.isFinite(maxHours) || maxHours < 0)) {
            return setModalError("A valid max contribution limit (hours) is required.");
        }
        if (!Number.isFinite(maxDailyCallLimit) || maxDailyCallLimit < 1) {
            return setModalError("A valid max daily call limit is required.");
        }

        const code = editingLanguage ? editingLanguage.code : toSlug(name);
        if (!editingLanguage && !code) return setModalError("Name must contain at least one letter or number.");

        setModalSaving(true);
        setModalError("");
        try {
            if (editingLanguage) {
                await patch(`/api/admin/languages/${editingLanguage._id}`, { name, hourlyPayout, sampleRate, maxHoursPerContributor: maxHours, maxDailyCallLimit, noisy: modalNoisy });
                setSuccess(`"${name}" updated successfully.`);
            } else {
                await postJson("/api/admin/languages", { name, code, hourlyPayout, sampleRate, maxHoursPerContributor: maxHours, maxDailyCallLimit, noisy: modalNoisy });
                setSuccess(`"${name}" added successfully.`);
            }
            closeModal();
            await load();
        } catch (e) {
            setModalError(e.message === "Language code already exists"
                ? "A language with that name/code already exists."
                : e.message);
        } finally {
            setModalSaving(false);
        }
    }

    async function toggle(lang) {
        setSaving(lang._id);
        try { await patch(`/api/admin/languages/${lang._id}`, { enabled: !lang.enabled }); await load(); }
        catch (e) { setError(e.message); }
        finally { setSaving(null); }
    }

    async function remove(lang) {
        if (!confirm(`Delete "${lang.name}"?`)) return;
        setSaving(lang._id + "_del");
        try { await del(`/api/admin/languages/${lang._id}`); await load(); }
        catch (e) { setError(e.message); }
        finally { setSaving(null); }
    }

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">

                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Call Languages</h1>
                        <p className="text-neutral-400 text-sm">Add and manage the languages users can apply to call in.</p>
                    </div>
                    <button
                        onClick={openModal}
                        className="px-5 py-2 bg-warning-600 hover:bg-warning-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                        + Add Language
                    </button>
                </div>

                {/* Alerts */}
                {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4 flex justify-between"><span>{error}</span><button onClick={() => setError("")} className="text-red-400 hover:text-red-200 ml-3">✕</button></div>}
                {success && <div className="bg-green-900/50 border border-green-700 text-green-300 px-4 py-3 rounded-lg mb-4 flex justify-between"><span>{success}</span><button onClick={() => setSuccess("")} className="text-green-400 hover:text-green-200 ml-3">✕</button></div>}

                {/* Table */}
                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                    </div>
                ) : languages.length === 0 ? (
                    <div className="text-center py-16 text-neutral-500">No languages yet. Click "+ Add Language" to create one.</div>
                ) : (
                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-neutral-700">
                                    <tr>
                                        {["Name", "Hourly Payout", "Sample Rate", "Max Limit", "Max Daily Limit", "Status", "Actions"].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-700">
                                    {languages.map(lang => (
                                        <tr key={lang._id} className="hover:bg-neutral-700/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="text-white font-medium">{lang.name}</div>
                                                {lang.noisy && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 bg-yellow-950 text-warning-400 text-[10px] font-bold rounded border border-warning-900/50">
                                                        ⚠️ Noisy
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-neutral-300 font-medium">${lang.hourlyPayout ?? 0}/hr</td>
                                            <td className="px-4 py-3 text-neutral-300 font-medium">{lang.sampleRate ?? 48000} Hz</td>
                                            <td className="px-4 py-3 text-neutral-300 font-medium">
                                                {lang.maxHoursPerContributor === undefined || lang.maxHoursPerContributor === -1
                                                    ? "Unlimited"
                                                    : `${lang.maxHoursPerContributor} hrs`
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-neutral-300 font-medium">{lang.maxDailyCallLimit ?? 5} calls</td>
                                            <td className="px-4 py-3">
                                                {lang.enabled
                                                    ? <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/50 text-green-300 text-xs font-semibold rounded-full">● Enabled</span>
                                                    : <span className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-700 text-neutral-400 text-xs font-semibold rounded-full">○ Disabled</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => fetchSummary(lang, "summary")}
                                                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-warning-600 hover:bg-warning-700 text-white transition-colors flex items-center gap-1"
                                                        title="View Contributor Summary & Demographics"
                                                    >
                                                        📊 Summary
                                                    </button>
                                                    <button
                                                        onClick={() => fetchSummary(lang, "users")}
                                                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1"
                                                        title="View Approved and Pending Users"
                                                    >
                                                        👥 Users
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(lang)}
                                                        disabled={!!saving}
                                                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => toggle(lang)}
                                                        disabled={!!saving}
                                                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${lang.enabled ? "bg-neutral-600 hover:bg-neutral-500 text-neutral-200" : "bg-warning-600 hover:bg-warning-700 text-white"}`}
                                                    >
                                                        {saving === lang._id ? "…" : lang.enabled ? "Disable" : "Enable"}
                                                    </button>
                                                    <button
                                                        onClick={() => remove(lang)}
                                                        disabled={!!saving}
                                                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors disabled:opacity-50"
                                                    >
                                                        {saving === lang._id + "_del" ? "…" : "Delete"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Language Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal} />

                    {/* Modal Panel */}
                    <div className="relative bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
                            <h2 className="text-lg font-bold text-white">{editingLanguage ? "Edit Language" : "Add New Language"}</h2>
                            <button onClick={closeModal} className="text-neutral-400 hover:text-white transition-colors text-xl leading-none">✕</button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={saveLanguage} className="px-6 py-5 space-y-4">
                            {modalError && (
                                <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded-lg text-sm">
                                    {modalError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-1.5">Language Name</label>
                                <input
                                    autoFocus
                                    className="w-full bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                    placeholder="e.g. Hindi"
                                    value={modalName}
                                    onChange={e => setModalName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-1.5">Hourly Payout</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                    placeholder="e.g. 25"
                                    value={modalHourlyPayout}
                                    onChange={e => setModalHourlyPayout(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-1.5">Sample Rate (Hz)</label>
                                <input
                                    type="number"
                                    min="8000"
                                    step="1"
                                    className="w-full bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                    placeholder="e.g. 48000"
                                    value={modalSampleRate}
                                    onChange={e => setModalSampleRate(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-1.5">Max Contribution Limit (Hours)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                    placeholder="e.g. 10 (Leave blank for unlimited)"
                                    value={modalMaxHoursPerContributor}
                                    onChange={e => setModalMaxHoursPerContributor(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-1.5">Max Daily Call Limit</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    className="w-full bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                    placeholder="e.g. 5"
                                    value={modalMaxDailyCallLimit}
                                    onChange={e => setModalMaxDailyCallLimit(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center gap-2.5 pt-1">
                                <input
                                    type="checkbox"
                                    id="noisy-lang-checkbox"
                                    checked={modalNoisy}
                                    onChange={e => setModalNoisy(e.target.checked)}
                                    className="w-4.5 h-4.5 text-warning-600 bg-neutral-700 border-neutral-600 rounded focus:ring-warning-500 focus:ring-2 focus:ring-offset-neutral-800"
                                />
                                <label htmlFor="noisy-lang-checkbox" className="text-sm font-medium text-neutral-300 select-none cursor-pointer">
                                    Noisy Language (Bypasses YAMNet noise scanning)
                                </label>
                            </div>

                            {/* Auto-generated slug preview */}
                            {!editingLanguage && modalName.trim() && (
                                <div className="text-xs text-neutral-500">
                                    Slug: <code className="bg-neutral-700 text-warning-300 px-1.5 py-0.5 rounded font-mono">{toSlug(modalName)}</code>
                                </div>
                            )}

                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="flex-1 py-2.5 border border-neutral-600 text-neutral-300 hover:bg-neutral-700 rounded-lg text-sm font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={modalSaving}
                                    className="flex-1 py-2.5 bg-warning-600 hover:bg-warning-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                                >
                                    {modalSaving ? (editingLanguage ? "Saving…" : "Adding…") : (editingLanguage ? "Save Changes" : "Add Language")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Contributor Summary / Users Modal */}
            {summaryModalLang && activeModalType && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={closeSummaryModal} />

                    <div className="relative bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in text-white">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700 bg-neutral-850">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {activeModalType === "summary" ? "📊 Contributor Demographics" : "👥 Contributors List"}
                                    <span className="text-warning-400 font-semibold">— {summaryModalLang.name}</span>
                                </h2>
                                <p className="text-xs text-neutral-400 mt-0.5">Call Language: {summaryModalLang.name} ({summaryModalLang.code})</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActiveModalType(activeModalType === "summary" ? "users" : "summary")}
                                    className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-xs font-semibold rounded-lg text-neutral-200 transition-colors"
                                >
                                    Switch to {activeModalType === "summary" ? "👥 Users List" : "📊 Demographics"}
                                </button>
                                <button onClick={closeSummaryModal} className="text-neutral-400 hover:text-white transition-colors text-xl leading-none px-2">✕</button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {summaryLoading ? (
                                <div className="flex justify-center py-16">
                                    <div className="w-10 h-10 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                                </div>
                            ) : !summaryData ? (
                                <div className="text-center py-12 text-neutral-400">Failed to load contributor data.</div>
                            ) : activeModalType === "summary" ? (
                                <div className="space-y-6">
                                    {/* Stats Overview */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                                            <span className="text-xs text-neutral-400 font-medium">Total Contributors</span>
                                            <div className="text-2xl font-bold text-white mt-1">{summaryData.totalContributors}</div>
                                        </div>
                                        <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                                            <span className="text-xs text-blue-400 font-medium">Male</span>
                                            <div className="text-2xl font-bold text-blue-400 mt-1">{summaryData.male}</div>
                                        </div>
                                        <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                                            <span className="text-xs text-pink-400 font-medium">Female</span>
                                            <div className="text-2xl font-bold text-pink-400 mt-1">{summaryData.female}</div>
                                        </div>
                                        <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                                            <span className="text-xs text-emerald-400 font-medium">Approved / Pending</span>
                                            <div className="text-2xl font-bold text-emerald-400 mt-1">
                                                {summaryData.approvedUsers.length} <span className="text-neutral-500 text-sm font-normal">/ {summaryData.pendingUsers.length}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Demographics Details Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Gender Breakdown */}
                                        <div className="bg-neutral-750 border border-neutral-700 p-5 rounded-xl">
                                            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Gender Breakdown</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">Male</span>
                                                        <span className="text-blue-400 font-semibold">{summaryData.male} ({summaryData.totalContributors > 0 ? Math.round((summaryData.male / summaryData.totalContributors) * 100) : 0}%)</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.male / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">Female</span>
                                                        <span className="text-pink-400 font-semibold">{summaryData.female} ({summaryData.totalContributors > 0 ? Math.round((summaryData.female / summaryData.totalContributors) * 100) : 0}%)</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-pink-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.female / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">Other / Unspecified</span>
                                                        <span className="text-neutral-400 font-semibold">{summaryData.otherGender}</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-neutral-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.otherGender / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Age Distribution */}
                                        <div className="bg-neutral-750 border border-neutral-700 p-5 rounded-xl">
                                            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Age Distribution</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">18 – 30 Years</span>
                                                        <span className="text-warning-400 font-semibold">{summaryData.age_18_30} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-warning-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_18_30 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">30 – 45 Years</span>
                                                        <span className="text-warning-400 font-semibold">{summaryData.age_30_45} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_30_45 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">45 – 60 Years</span>
                                                        <span className="text-warning-400 font-semibold">{summaryData.age_45_60} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-orange-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_45_60 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">60+ Years</span>
                                                        <span className="text-warning-400 font-semibold">{summaryData.age_60_plus} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-red-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_60_plus / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Users Tab View */
                                <div>
                                    {/* Tabs */}
                                    <div className="flex items-center justify-between border-b border-neutral-700 pb-3 mb-4 gap-4 flex-wrap">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setUsersTab("approved")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${usersTab === "approved" ? "bg-emerald-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Approved Contributors ({summaryData.approvedUsers.length})
                                            </button>
                                            <button
                                                onClick={() => setUsersTab("pending")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${usersTab === "pending" ? "bg-amber-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Pending Contributors ({summaryData.pendingUsers.length})
                                            </button>
                                            <button
                                                onClick={() => setUsersTab("rejected")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${usersTab === "rejected" ? "bg-red-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Rejected Contributors ({summaryData.rejectedUsers?.length || 0})
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Search by name, email, speaker_id..."
                                            value={usersSearch}
                                            onChange={e => setUsersSearch(e.target.value)}
                                            className="bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-warning-500 min-w-[200px]"
                                        />
                                    </div>

                                    {/* Users Table */}
                                    {(() => {
                                        const list = usersTab === "approved" 
                                            ? summaryData.approvedUsers 
                                            : usersTab === "pending" 
                                            ? summaryData.pendingUsers 
                                            : (summaryData.rejectedUsers || []);
                                        const filtered = list.filter(u => {
                                            if (!usersSearch.trim()) return true;
                                            const q = usersSearch.toLowerCase();
                                            return (
                                                (u.firstname + " " + u.lastname).toLowerCase().includes(q) ||
                                                (u.username || "").toLowerCase().includes(q) ||
                                                (u.email || "").toLowerCase().includes(q) ||
                                                (u.speaker_id || "").toLowerCase().includes(q) ||
                                                (u.state || "").toLowerCase().includes(q)
                                            );
                                        });

                                        if (filtered.length === 0) {
                                            return (
                                                <div className="text-center py-12 text-neutral-400 text-sm">
                                                    No {usersTab} contributors found.
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="border border-neutral-700 rounded-xl overflow-hidden bg-neutral-850">
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-neutral-700 text-neutral-300 uppercase tracking-wider font-semibold">
                                                            <tr>
                                                                <th className="px-4 py-2.5 text-left">Speaker ID</th>
                                                                <th className="px-4 py-2.5 text-left">Contributor</th>
                                                                <th className="px-4 py-2.5 text-left">Email</th>
                                                                <th className="px-4 py-2.5 text-left">Gender / Age</th>
                                                                <th className="px-4 py-2.5 text-left">State / Locality</th>
                                                                <th className="px-4 py-2.5 text-left">Status</th>
                                                                <th className="px-4 py-2.5 text-left">Noise Gate (dB)</th>
                                                                <th className="px-4 py-2.5 text-right">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-neutral-700/80">
                                                            {filtered.map(u => (
                                                                <tr key={u._id} className="hover:bg-neutral-700/40">
                                                                    <td className="px-4 py-2.5 font-mono text-warning-400 font-semibold">{u.speaker_id}</td>
                                                                    <td className="px-4 py-2.5 font-medium text-white">
                                                                        {u.firstname} {u.lastname}
                                                                        <div className="text-[10px] text-neutral-400 font-normal">@{u.username}</div>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-neutral-300">{u.email}</td>
                                                                    <td className="px-4 py-2.5 capitalize text-neutral-300">
                                                                        {u.gender} <span className="text-neutral-400">({u.age} yrs)</span>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-neutral-300">
                                                                        {u.state} <span className="text-neutral-400">({u.locality})</span>
                                                                    </td>
                                                                    <td className="px-4 py-2.5">
                                                                        {u.status === "approved" ? (
                                                                            <span className="px-2 py-0.5 bg-emerald-900/60 text-emerald-300 text-[10px] font-bold rounded-full">Approved</span>
                                                                        ) : u.status === "rejected" ? (
                                                                            <span className="px-2 py-0.5 bg-red-900/60 text-red-300 text-[10px] font-bold rounded-full">Rejected</span>
                                                                        ) : (
                                                                            <span className="px-2 py-0.5 bg-amber-900/60 text-amber-300 text-[10px] font-bold rounded-full">Pending</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-2.5">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-md border ${
                                                                                (u.noiseGateDb || 0) === 0 
                                                                                    ? "bg-neutral-800 text-neutral-300 border-neutral-700" 
                                                                                    : "bg-warning-950/80 text-warning-400 border-warning-700/60"
                                                                            }`}>
                                                                                {(u.noiseGateDb || 0) === 0 ? "0 dB (RAW)" : `${u.noiseGateDb} dB`}
                                                                            </span>
                                                                            <button
                                                                                onClick={() => openSetCallNoiseGateModal(u)}
                                                                                className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-warning-400 hover:text-warning-300 text-[11px] font-semibold rounded-lg transition-colors border border-neutral-600 flex items-center gap-1 shadow-sm"
                                                                            >
                                                                                <Sliders className="w-3 h-3" />
                                                                                Set Noise Gate
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-right">
                                                                        {usersTab === "approved" && (
                                                                            <button
                                                                                onClick={() => handleRemoveCallContributor(u)}
                                                                                className="px-2.5 py-1 bg-red-600/90 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
                                                                            >
                                                                                Remove Contributor
                                                                            </button>
                                                                        )}
                                                                        {usersTab === "rejected" && (
                                                                            <button
                                                                                onClick={() => handleResetCallContributor(u)}
                                                                                className="px-2.5 py-1 bg-blue-600/90 hover:bg-blue-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
                                                                            >
                                                                                Reset Application
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
