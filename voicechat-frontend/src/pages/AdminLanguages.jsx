import React, { useEffect, useState } from "react";
import AdminNav from "../components/AdminNav.jsx";

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
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState("");

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
        setModalError("");
    }

    async function saveLanguage(e) {
        e.preventDefault();
        const name = modalName.trim();
        const hourlyPayout = Number(modalHourlyPayout);
        const sampleRate = Number(modalSampleRate);
        const maxHours = modalMaxHoursPerContributor.trim() === "" ? -1 : Number(modalMaxHoursPerContributor);

        if (!name) return setModalError("Language name is required.");
        if (!Number.isFinite(hourlyPayout) || hourlyPayout < 0) return setModalError("A valid hourly payout is required.");
        if (!Number.isFinite(sampleRate) || sampleRate <= 0) return setModalError("A valid sample rate is required.");
        if (modalMaxHoursPerContributor.trim() !== "" && (!Number.isFinite(maxHours) || maxHours < 0)) {
            return setModalError("A valid max contribution limit (hours) is required.");
        }

        const code = editingLanguage ? editingLanguage.code : toSlug(name);
        if (!editingLanguage && !code) return setModalError("Name must contain at least one letter or number.");

        setModalSaving(true);
        setModalError("");
        try {
            if (editingLanguage) {
                await patch(`/api/admin/languages/${editingLanguage._id}`, { name, hourlyPayout, sampleRate, maxHoursPerContributor: maxHours });
                setSuccess(`"${name}" updated successfully.`);
            } else {
                await postJson("/api/admin/languages", { name, code, hourlyPayout, sampleRate, maxHoursPerContributor: maxHours });
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
                                        {["Name", "Hourly Payout", "Sample Rate", "Max Limit", "Status", "Actions"].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-700">
                                    {languages.map(lang => (
                                        <tr key={lang._id} className="hover:bg-neutral-700/40 transition-colors">
                                            <td className="px-4 py-3 text-white font-medium">{lang.name}</td>
                                            <td className="px-4 py-3 text-neutral-300 font-medium">${lang.hourlyPayout ?? 0}/hr</td>
                                            <td className="px-4 py-3 text-neutral-300 font-medium">{lang.sampleRate ?? 48000} Hz</td>
                                            <td className="px-4 py-3 text-neutral-300 font-medium">
                                                {lang.maxHoursPerContributor === undefined || lang.maxHoursPerContributor === -1
                                                    ? "Unlimited"
                                                    : `${lang.maxHoursPerContributor} hrs`
                                                }
                                            </td>
                                            <td className="px-4 py-3">
                                                {lang.enabled
                                                    ? <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/50 text-green-300 text-xs font-semibold rounded-full">● Enabled</span>
                                                    : <span className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-700 text-neutral-400 text-xs font-semibold rounded-full">○ Disabled</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => openEditModal(lang)}
                                                        disabled={!!saving}
                                                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => toggle(lang)}
                                                        disabled={!!saving}
                                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${lang.enabled ? "bg-neutral-600 hover:bg-neutral-500 text-neutral-200" : "bg-warning-600 hover:bg-warning-700 text-white"}`}
                                                    >
                                                        {saving === lang._id ? "…" : lang.enabled ? "Disable" : "Enable"}
                                                    </button>
                                                    <button
                                                        onClick={() => remove(lang)}
                                                        disabled={!!saving}
                                                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors disabled:opacity-50"
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
        </div>
    );
}
