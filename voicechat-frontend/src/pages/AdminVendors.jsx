import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UsersRound,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Phone,
  Mail,
  User,
  Settings,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Building,
  Award,
  Sparkles,
  Sliders,
  Percent,
  Trash2,
  Eye,
  Globe,
  AlertTriangle
} from "lucide-react";
import AdminNav from "../components/AdminNav.jsx";
import { apiGet, apiPostJson, apiPutJson, apiDeleteJson } from "../lib/api.js";
import Swal from "sweetalert2";

export default function AdminVendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedCode, setCopiedCode] = useState(null);

  // Catalog of subprojects
  const [catalog, setCatalog] = useState({ call: [], scripted_call: [], phrase: [] });

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Active Selected Vendor
  const [activeVendor, setActiveVendor] = useState(null);
  const [communityData, setCommunityData] = useState([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);

  // Create Vendor Form State
  const [formData, setFormData] = useState({
    name: "",
    vendorCode: "",
    contactPerson: "",
    email: "",
    phone: "",
    password: "",
    isStudio: false,
    notes: ""
  });

  // Project Assignment State
  const [selectedCategories, setSelectedCategories] = useState({
    call: false,
    scripted_call: false,
    phrase: false
  });
  const [subprojectAssignments, setSubprojectAssignments] = useState({}); // { [subprojectId]: { ...config } }
  const [savingAssignments, setSavingAssignments] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const [vendorsRes, catalogRes] = await Promise.all([
        apiGet("/api/admin/vendors"),
        apiGet("/api/admin/vendors/catalog")
      ]);
      setVendors(vendorsRes.vendors || []);
      setCatalog(catalogRes.catalog || { call: [], scripted_call: [], phrase: [] });
    } catch (err) {
      console.error("Failed to load vendor data:", err);
      Swal.fire({
        icon: "error",
        title: "Error Loading Data",
        text: err.message || "Failed to load vendors",
        background: "#171717",
        color: "#fff"
      });
    } finally {
      setLoading(false);
    }
  }

  // Copy referral link
  const copyInviteLink = (vendorCode) => {
    const origin = window.location.origin;
    const url = `${origin}/signup?vendor=${vendorCode}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(vendorCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Open Project Assignment Modal
  const openAssignmentModal = (vendor) => {
    setActiveVendor(vendor);
    
    // Determine which categories are already present
    const categories = { call: false, scripted_call: false, phrase: false };
    const assignmentsMap = {};

    const allCatalog = [
      ...(catalog.call || []),
      ...(catalog.scripted_call || []),
      ...(catalog.phrase || [])
    ];

    (vendor.assignedProjects || []).forEach((proj) => {
      if (proj.category) categories[proj.category] = true;
      const matched = allCatalog.find((c) => c.subprojectId === proj.subprojectId);
      const payrate = Number(matched?.hourlyPayout || proj.hourlyPayout) || 25;
      const default10Percent = Number((payrate * 0.10).toFixed(2));

      // If saved baseRate is missing, 0, or exceeds payrate (legacy test bug), strictly default to 10%
      const initialRate = (proj.baseRate !== undefined && proj.baseRate !== null && Number(proj.baseRate) > 0 && Number(proj.baseRate) <= payrate)
        ? Number(proj.baseRate)
        : default10Percent;

      assignmentsMap[proj.subprojectId] = {
        category: proj.category,
        subprojectId: proj.subprojectId,
        subprojectName: proj.subprojectName,
        languageCode: proj.languageCode || "",
        assignedLanguages: (Array.isArray(proj.assignedLanguages) && proj.assignedLanguages.length > 0)
          ? proj.assignedLanguages
          : (matched?.languages || (proj.languageCode ? [proj.languageCode] : [])),
        marginType: proj.marginType || "fixed_per_unit",
        baseRate: initialRate,
        unitLabel: "approved hr",
        isActive: proj.isActive !== false
      };
    });

    setSelectedCategories(categories);
    setSubprojectAssignments(assignmentsMap);
    setShowAssignModal(true);
  };

  // Toggle Category Checkbox
  const toggleCategory = (categoryKey) => {
    setSelectedCategories((prev) => {
      const next = !prev[categoryKey];
      return { ...prev, [categoryKey]: next };
    });
  };

  // Toggle Single Subproject Checkbox
  const toggleSubproject = (item) => {
    setSubprojectAssignments((prev) => {
      const exists = !!prev[item.subprojectId];
      if (exists) {
        const copy = { ...prev };
        delete copy[item.subprojectId];
        return copy;
      } else {
        const payrate = Number(item.hourlyPayout) || 25;
        const defaultRate = Number((payrate * 0.10).toFixed(2)); // Exactly 10% of contributor payrate
        const defaultLanguages = (item.languages && item.languages.length > 0)
          ? [...item.languages]
          : (item.languageCode ? [item.languageCode] : []);

        return {
          ...prev,
          [item.subprojectId]: {
            category: item.category,
            subprojectId: item.subprojectId,
            subprojectName: item.subprojectName,
            languageCode: item.languageCode || "",
            assignedLanguages: defaultLanguages,
            marginType: item.defaultMarginType || "fixed_per_unit",
            baseRate: defaultRate,
            unitLabel: "approved hr",
            isActive: true
          }
        };
      }
    });
  };

  // Toggle language selection for a specific assigned subproject
  const toggleLanguageForSubproject = (subprojectId, langCode, allLangs) => {
    setSubprojectAssignments((prev) => {
      const currentConfig = prev[subprojectId];
      if (!currentConfig) return prev;
      const currentLangs = currentConfig.assignedLanguages || (allLangs ? [...allLangs] : []);
      const targetLang = String(langCode).toLowerCase().trim();
      const exists = currentLangs.some((l) => String(l).toLowerCase().trim() === targetLang);

      let nextLangs;
      if (exists) {
        if (currentLangs.length <= 1) {
          Swal.fire({
            toast: true,
            position: "top-end",
            icon: "warning",
            title: "At least 1 language must remain selected",
            timer: 2500,
            showConfirmButton: false,
            background: "#171717",
            color: "#fff"
          });
          return prev;
        }
        nextLangs = currentLangs.filter((l) => String(l).toLowerCase().trim() !== targetLang);
      } else {
        nextLangs = [...currentLangs, targetLang];
      }

      return {
        ...prev,
        [subprojectId]: {
          ...currentConfig,
          assignedLanguages: nextLangs
        }
      };
    });
  };

  // Select all languages for a subproject
  const selectAllLanguagesForSubproject = (subprojectId, allLangs) => {
    setSubprojectAssignments((prev) => {
      const currentConfig = prev[subprojectId];
      if (!currentConfig) return prev;
      return {
        ...prev,
        [subprojectId]: {
          ...currentConfig,
          assignedLanguages: allLangs.map((l) => String(l).toLowerCase().trim())
        }
      };
    });
  };

  // Clear all except the first language
  const clearLanguagesForSubproject = (subprojectId, allLangs) => {
    setSubprojectAssignments((prev) => {
      const currentConfig = prev[subprojectId];
      if (!currentConfig) return prev;
      const firstLang = allLangs?.[0] ? [String(allLangs[0]).toLowerCase().trim()] : [];
      return {
        ...prev,
        [subprojectId]: {
          ...currentConfig,
          assignedLanguages: firstLang
        }
      };
    });
  };

  // Save Project Assignments
  const saveAssignments = async () => {
    if (!activeVendor) return;
    setSavingAssignments(true);
    try {
      // Filter assignments strictly to currently ticked categories
      const projectsToSave = Object.values(subprojectAssignments)
        .filter((proj) => selectedCategories[proj.category])
        .map((proj) => ({
          ...proj,
          unitLabel: "approved hr",
          baseRate: activeVendor.isStudio ? 0 : (Number(proj.baseRate) || 0)
        }));

      // Validation: Enforce that every assigned phrase project has at least 1 language selected
      for (const proj of projectsToSave) {
        if (proj.category === "phrase" && (!proj.assignedLanguages || proj.assignedLanguages.length === 0)) {
          Swal.fire({
            icon: "warning",
            title: "Language Selection Required",
            text: `Please select at least 1 language for "${proj.subprojectName}".`,
            background: "#171717",
            color: "#fff"
          });
          setSavingAssignments(false);
          return;
        }
      }

      await apiPutJson(`/api/admin/vendors/${activeVendor._id}/assignments`, {
        assignedProjects: projectsToSave
      });

      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Project assignments saved successfully!",
        timer: 3000,
        showConfirmButton: false,
        background: "#171717",
        color: "#fff"
      });

      setShowAssignModal(false);
      fetchInitialData();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Save Failed",
        text: err.message || "Failed to update assignments",
        background: "#171717",
        color: "#fff"
      });
    } finally {
      setSavingAssignments(false);
    }
  };

  // Open Community Roster Drawer
  const openCommunityModal = async (vendor) => {
    setActiveVendor(vendor);
    setShowCommunityModal(true);
    setLoadingCommunity(true);
    try {
      const res = await apiGet(`/api/admin/vendors/${vendor._id}`);
      setCommunityData(res.community || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCommunity(false);
    }
  };

  // Create Vendor
  const handleCreateVendor = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.vendorCode || !formData.email || !formData.password) {
      Swal.fire("Validation Error", "Please fill out all required fields.", "warning");
      return;
    }

    try {
      await apiPostJson("/api/admin/vendors", {
        name: formData.name,
        vendorCode: formData.vendorCode,
        contactPerson: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        isStudio: Boolean(formData.isStudio),
        notes: formData.notes
      });

      Swal.fire({
        icon: "success",
        title: "Vendor Created!",
        text: `Vendor account for ${formData.name} created. You can now assign projects and share their invite code.`,
        background: "#171717",
        color: "#fff"
      });

      setShowCreateModal(false);
      setFormData({
        name: "",
        vendorCode: "",
        contactPerson: "",
        email: "",
        phone: "",
        password: "",
        isStudio: false,
        notes: ""
      });
      fetchInitialData();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Failed to Create Vendor",
        text: err.message || "Could not create vendor",
        background: "#171717",
        color: "#fff"
      });
    }
  };

  // Permanently Delete Vendor Account
  const handleDeleteVendor = async (vendor) => {
    const workerCount = vendor.stats?.totalWorkers || 0;
    const confirm = await Swal.fire({
      title: `Permanently Delete ${vendor.name}?`,
      html: `
        <div class="text-left text-xs sm:text-sm text-neutral-300 space-y-2.5">
          <p>Are you sure you want to permanently delete this vendor partner account?</p>
          <div class="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1.5 text-rose-300">
            <div class="font-bold flex items-center gap-1.5 text-rose-400">
              ⚠️ Permanent Deletion Notice
            </div>
            <ul class="list-disc pl-4 space-y-1 text-rose-200/90 text-xs">
              <li>This vendor record and portal credentials will be permanently erased.</li>
              ${
                workerCount > 0
                  ? `<li>All <strong>${workerCount} linked contributor account${workerCount === 1 ? "" : "s"}</strong> will automatically <strong>turn into normal, independent community contributors</strong> (full direct pay, unrestricted project access).</li>`
                  : `<li>All historical worker records are preserved.</li>`
              }
            </ul>
          </div>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#262626",
      confirmButtonText: "Yes, Permanently Delete",
      cancelButtonText: "Cancel",
      background: "#171717",
      color: "#fff"
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiDeleteJson(`/api/admin/vendors/${vendor._id}`);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: res.message || "Vendor permanently deleted",
        timer: 3500,
        showConfirmButton: false,
        background: "#171717",
        color: "#fff"
      });
      fetchInitialData();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Delete Failed",
        text: err.message || "Failed to delete vendor",
        background: "#171717",
        color: "#fff"
      });
    }
  };

  // Suspend Vendor Account & Release Linked Contributors
  const handleSuspendVendor = async (vendor) => {
    const workerCount = vendor.stats?.totalWorkers || 0;
    const confirm = await Swal.fire({
      title: `Suspend ${vendor.name}?`,
      html: `
        <div class="text-left text-xs sm:text-sm text-neutral-300 space-y-2.5">
          <p>Are you sure you want to suspend vendor <strong class="text-white">${vendor.name}</strong> (<span class="font-mono text-primary-400">${vendor.vendorCode}</span>)?</p>
          <div class="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            <div class="font-bold text-rose-200 flex items-center gap-1.5 mb-1.5">
              <span>⚠️ Critical Account Changes:</span>
            </div>
            <ul class="list-disc pl-4 space-y-1 text-rose-200/90">
              <li>The vendor will be immediately locked out of the Vendor Portal.</li>
              <li>All <strong>${workerCount} linked contributor accounts</strong> will automatically <strong>turn into normal, independent community contributors</strong>.</li>
              <li>Their payrates reset to 100% standard project pay (direct to UPI), and vendor project/language restrictions will be lifted.</li>
            </ul>
          </div>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#262626",
      confirmButtonText: "Yes, Suspend Account & Release Contributors",
      cancelButtonText: "Cancel",
      background: "#171717",
      color: "#fff"
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiPostJson(`/api/admin/vendors/${vendor._id}/suspend`);
      Swal.fire({
        icon: "success",
        title: "Vendor Suspended",
        text: res.message || "Vendor suspended and contributors released to normal community status.",
        background: "#171717",
        color: "#fff"
      });
      fetchInitialData();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Suspension Failed",
        text: err.message || "Failed to suspend vendor account",
        background: "#171717",
        color: "#fff"
      });
    }
  };

  // Reactivate Suspended Vendor Account
  const handleReactivateVendor = async (vendor) => {
    const confirm = await Swal.fire({
      title: `Reactivate ${vendor.name}?`,
      text: "Restore login access and active status for this vendor partner?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#262626",
      confirmButtonText: "Yes, Reactivate",
      cancelButtonText: "Cancel",
      background: "#171717",
      color: "#fff"
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiPostJson(`/api/admin/vendors/${vendor._id}/reactivate`);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: res.message || "Vendor reactivated successfully",
        timer: 3000,
        showConfirmButton: false,
        background: "#171717",
        color: "#fff"
      });
      fetchInitialData();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Reactivation Failed",
        text: err.message || "Failed to reactivate vendor account",
        background: "#171717",
        color: "#fff"
      });
    }
  };

  // Filtered vendors
  const filteredVendors = vendors.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.vendorCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.contactPerson && v.contactPerson.toLowerCase().includes(searchQuery.toLowerCase())) ||
      v.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      v.status === statusFilter ||
      (statusFilter === "inactive" && (v.status === "inactive" || v.status === "suspended"));
    return matchesSearch && matchesStatus;
  });

  // Calculate totals
  const totalWorkers = vendors.reduce((acc, v) => acc + (v.stats?.totalWorkers || 0), 0);
  const totalApprovedHours = vendors.reduce((acc, v) => acc + (v.stats?.totalApprovedHours || 0), 0);
  const totalMarginPayable = vendors.reduce((acc, v) => acc + (v.stats?.estimatedMarginPayable || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <AdminNav />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Header & Stat Cards */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-600/20 border border-primary-500/30 rounded-xl text-primary-400">
                <Building className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Vendor & Agency Management
                </h1>
                <p className="text-neutral-400 text-sm mt-0.5">
                  Manage external vendor partners, assign scoped projects, and set direct margins.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-lg shadow-primary-600/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add New Vendor
            </button>
          </div>
        </div>

        {/* Global Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Total Vendors</span>
              <Building className="w-5 h-5 text-neutral-400" />
            </div>
            <div className="text-3xl font-extrabold text-white mt-2">{vendors.length}</div>
            <div className="text-xs text-neutral-400 mt-1">Active partner agencies</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Community Workers</span>
              <UsersRound className="w-5 h-5 text-primary-400" />
            </div>
            <div className="text-3xl font-extrabold text-primary-400 mt-2">{totalWorkers}</div>
            <div className="text-xs text-neutral-400 mt-1">Directly paid by DataCatalyst</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Delivered Volume</span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-emerald-400 mt-2">{totalApprovedHours.toFixed(1)} hrs</div>
            <div className="text-xs text-neutral-400 mt-1">Approved valid speech audio</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Est. Vendor Margin</span>
              <DollarSign className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-amber-400 mt-2">${totalMarginPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-neutral-400 mt-1">Verified margin on approved hours</div>
          </div>
        </div>

        {/* Ethical Fair-Pay & Direct Worker Guarantee Alert */}
        <div className="bg-gradient-to-r from-emerald-950/40 via-neutral-900 to-primary-950/40 border border-emerald-500/30 rounded-2xl p-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                Ethical Fair-Pay Standard Enabled
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Protected
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                All community contributors receive 100% of standard project pay directly into their UPI accounts. Vendor commissions are funded independently by DataCatalyst based on verified QA approval rates.
              </p>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search by vendor name, code, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-800 focus:border-primary-500 rounded-xl text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto self-end">
            <span className="text-xs text-neutral-400 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-primary-500"
            >
              <option value="all">All Vendors</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
              <option value="inactive">Inactive / Suspended</option>
            </select>
          </div>
        </div>

        {/* Vendor Cards List */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-neutral-400 text-sm">Loading vendor partners...</p>
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl py-16 text-center">
            <Building className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white">No Vendors Found</h3>
            <p className="text-neutral-400 text-sm max-w-md mx-auto mt-1 mb-6">
              {searchQuery ? "No vendors matched your search criteria." : "Create your first vendor account to begin onboarding communities."}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl"
            >
              Add New Vendor
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredVendors.map((vendor) => {
              const stats = vendor.stats || {};
              const totalAudited = stats.totalAudited !== undefined ? stats.totalAudited : ((stats.totalApproved || 0) + (stats.totalRejected || 0));
              const hasAudits = totalAudited > 0;
              const approvalRate = hasAudits ? (stats.overallApprovalRate || 0) : 0;
              const assignedCount = (vendor.assignedProjects || []).length;



              return (
                <div
                  key={vendor._id}
                  className="bg-neutral-900/80 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 transition-all shadow-sm"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Left Section: Vendor Identity & Invite Link */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-white">{vendor.name}</h2>
                        <span
                          className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                            vendor.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : vendor.status === "suspended"
                              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                              : "bg-neutral-800 text-neutral-400 border-neutral-700"
                          }`}
                        >
                          {vendor.status.toUpperCase()}
                        </span>
                        {vendor.isStudio ? (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            STUDIO
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            COMMUNITY
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-neutral-400">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-neutral-500" />
                          {vendor.contactPerson || "No contact person"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-neutral-500" />
                          {vendor.email}
                        </span>
                        {vendor.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-neutral-500" />
                            {vendor.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-neutral-500" />
                          {vendor.payoutDetails?.upiId ? (
                            <span className="text-emerald-400 font-mono font-medium">
                              UPI: {vendor.payoutDetails.upiId} ({vendor.payoutDetails.accountHolderName || "Verified"})
                            </span>
                          ) : (
                            <span className="text-amber-400/90 font-medium">
                              UPI: Pending Setup by Vendor
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Invite Link Quick Copy */}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 px-3 py-1.5 rounded-xl text-xs font-mono text-neutral-300">
                          <span className="text-neutral-500 select-none">Code:</span>
                          <span className="font-bold text-primary-400">{vendor.vendorCode}</span>
                        </div>
                        <button
                          onClick={() => copyInviteLink(vendor.vendorCode)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-xl transition-colors"
                          title="Copy contributor signup link for this agency"
                        >
                          {copiedCode === vendor.vendorCode ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-semibold">Copied Link!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-neutral-400" />
                              <span>Copy Signup Link</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Assigned Projects & Languages Quick Summary */}
                      {(vendor.assignedProjects || []).filter(p => p.isActive !== false).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-neutral-500 font-medium">Assigned:</span>
                          {(vendor.assignedProjects || []).filter(p => p.isActive !== false).slice(0, 3).map((p, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 flex items-center gap-1"
                            >
                              <span className="truncate max-w-[130px]">{p.subprojectName}</span>
                              {p.assignedLanguages && p.assignedLanguages.length > 0 && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                                  {p.assignedLanguages.length} lang{p.assignedLanguages.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </span>
                          ))}
                          {(vendor.assignedProjects || []).filter(p => p.isActive !== false).length > 3 && (
                            <span className="text-[10px] text-neutral-500">
                              +{(vendor.assignedProjects || []).filter(p => p.isActive !== false).length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Middle Section: Performance & Quality Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3.5">
                      <div>
                        <div className="text-[11px] text-neutral-400 uppercase font-medium">Workers</div>
                        <div className="text-base font-black text-white mt-0.5">{stats.totalWorkers || 0}</div>
                      </div>

                      <div>
                        <div className="text-[11px] text-neutral-400 uppercase font-medium">Approval %</div>
                        <div className="text-base font-black text-white mt-0.5">{hasAudits ? `${approvalRate}%` : "—"}</div>
                      </div>

                      <div>
                        <div className="text-[11px] text-neutral-400 uppercase font-medium">Delivered Audio</div>
                        <div className="text-base font-black text-white mt-0.5">{stats.totalApprovedHours || 0} hrs</div>
                      </div>

                      <div>
                        <div className="text-[11px] text-neutral-400 uppercase font-medium">
                          {vendor.isStudio ? "Est. Studio Margin" : "Est. Margin"}
                        </div>
                        <div className={`text-base font-black mt-0.5 ${vendor.isStudio ? "text-purple-400" : "text-amber-400"}`}>
                          ${(stats.estimatedMarginPayable || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {vendor.isStudio && (
                          <div className="text-[10px] text-neutral-400 font-medium mt-0.5">
                            Split Margin (${(stats.totalArtistPayout || 0).toFixed(2)} to artists)
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Section: Action Buttons */}
                    <div className="flex flex-wrap lg:flex-col gap-2 justify-end">
                      <button
                        onClick={() => openAssignmentModal(vendor)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-primary-600/20 hover:bg-primary-600/30 text-primary-300 border border-primary-500/30 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Assign Projects ({assignedCount})
                      </button>

                      <button
                        onClick={() => openCommunityModal(vendor)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <UsersRound className="w-3.5 h-3.5 text-neutral-400" />
                        View Workers ({stats.totalWorkers || 0})
                      </button>

                      {vendor.status === "suspended" ? (
                        <button
                          onClick={() => handleReactivateVendor(vendor)}
                          className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors"
                          title="Reactivate Vendor Portal Access"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          Reactivate Vendor
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSuspendVendor(vendor)}
                          className="flex items-center gap-2 px-3.5 py-2 bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors"
                          title="Suspend Vendor Account & Release All Workers"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          Suspend Account
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteVendor(vendor)}
                        className="p-2 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors self-end"
                        title="Permanently Delete Vendor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ─── MODAL 1: CREATE NEW VENDOR ─────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-600/20 text-primary-400 rounded-xl">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Create Vendor Partner Account</h3>
                    <p className="text-xs text-neutral-400">Add an agency or team lead to manage contributors</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateVendor} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Agency / Vendor Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Media Solutions"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Unique Vendor Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. APEX (used in ?vendor=APEX)"
                      value={formData.vendorCode}
                      onChange={(e) => setFormData({ ...formData, vendorCode: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm font-mono uppercase text-neutral-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Contact Person</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={formData.contactPerson}
                      onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Phone Number</label>
                    <input
                      type="text"
                      placeholder="+91 9876543210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Login Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="partner@agency.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Login Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Minimum 6 characters"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                {/* Sliding ON/OFF Toggle: Studio Partner Account */}
                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">Studio Partner Account</span>
                      {formData.isStudio ? (
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Studio Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Standard Vendor
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 max-w-sm">
                      {formData.isStudio
                        ? "Studio does not receive platform margins. Studio decides custom payrates for its voice artists when creating accounts. (Artists still pass all intro & QA approvals)."
                        : "Standard Community Vendor: Receives agreed direct margins for approved units. Contributors receive standard platform pay directly from DataCatalyst."}
                    </p>
                  </div>

                  {/* Sliding Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isStudio: !formData.isStudio })}
                    className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors duration-300 focus:outline-none shrink-0 ${
                      formData.isStudio ? "bg-purple-600" : "bg-neutral-800"
                    }`}
                  >
                    <div
                      className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ${
                        formData.isStudio ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-primary-600/25"
                  >
                    Create Vendor
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL 2: CASCADING PROJECT ASSIGNMENT & MARGINS WIZARD ────────── */}
      <AnimatePresence>
        {showAssignModal && activeVendor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary-600/20 text-primary-400 border border-primary-500/30">
                      {activeVendor.vendorCode}
                    </span>
                    {activeVendor.isStudio ? (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Studio Partner
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        Community Vendor
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-white">
                      {activeVendor.isStudio ? "Assign Studio Projects" : "Assign Projects & Margins"}
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    {activeVendor.isStudio
                      ? `Select project verticals and sub-projects for Studio Partner ${activeVendor.name}. Studio directly determines voice artist payrates (0 platform margin).`
                      : `Select categories, then choose sub-projects and set per-project quality margins for ${activeVendor.name}.`}
                  </p>
                </div>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* STEP 1: Top-Level Category Checkboxes */}
                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-3">
                    Step 1: Select Project Verticals (Categories)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Call Checkbox */}
                    <label
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        selectedCategories.call
                          ? "bg-primary-600/15 border-primary-500 text-white shadow-sm"
                          : "bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.call}
                        onChange={() => toggleCategory("call")}
                        className="w-4 h-4 accent-primary-500 rounded"
                      />
                      <div>
                        <div className="font-bold text-sm text-white">Call</div>
                        <div className="text-[11px] text-neutral-400">Natural 2-Party Audio</div>
                      </div>
                    </label>

                    {/* Scripted Call Checkbox */}
                    <label
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        selectedCategories.scripted_call
                          ? "bg-primary-600/15 border-primary-500 text-white shadow-sm"
                          : "bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.scripted_call}
                        onChange={() => toggleCategory("scripted_call")}
                        className="w-4 h-4 accent-primary-500 rounded"
                      />
                      <div>
                        <div className="font-bold text-sm text-white">Scripted Call</div>
                        <div className="text-[11px] text-neutral-400">Guided Scenario Roleplay</div>
                      </div>
                    </label>

                    {/* Phrases Checkbox */}
                    <label
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        selectedCategories.phrase
                          ? "bg-primary-600/15 border-primary-500 text-white shadow-sm"
                          : "bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.phrase}
                        onChange={() => toggleCategory("phrase")}
                        className="w-4 h-4 accent-primary-500 rounded"
                      />
                      <div>
                        <div className="font-bold text-sm text-white">Phrases</div>
                        <div className="text-[11px] text-neutral-400">Prompt & Sentence Audio</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* STEP 2: Cascading Sub-Projects (Only for Ticked Categories) */}
                <div className="space-y-6">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                    {activeVendor.isStudio
                      ? "Step 2: Dynamic Sub-Projects (Studio Partner Split — No Margin Skim)"
                      : "Step 2: Dynamic Sub-Projects & Per-Project Margins"}
                  </span>

                  {activeVendor.isStudio && (
                    <div className="p-4 bg-purple-950/30 border border-purple-500/30 rounded-2xl flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-neutral-300 space-y-1">
                        <div className="font-bold text-purple-300">Studio Partner: 100% Rate Split Model</div>
                        <p>
                          You do not configure margins for Studio Partners. The studio sets voice artist payrates directly in the Studio Portal.
                          DataCatalyst pays artists their configured rate directly, and pays the studio the remaining balance (<span className="text-emerald-400 font-semibold">$Project Rate</span> − <span className="text-purple-300 font-semibold">$Artist Rate</span>).
                          The combined payout across both equals 100% of the project rate.
                        </p>
                      </div>
                    </div>
                  )}

                  {!selectedCategories.call && !selectedCategories.scripted_call && !selectedCategories.phrase && (
                    <div className="py-10 text-center text-neutral-500 text-xs border border-dashed border-neutral-800 rounded-2xl">
                      Select at least one vertical above to reveal sub-projects.
                    </div>
                  )}

                  {/* ─── 1. CALL VERTICAL (If Ticked) ─── */}
                  {selectedCategories.call && (
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                          <h4 className="text-sm font-bold text-white">Call Sub-Projects</h4>
                        </div>
                        <span className="text-xs text-neutral-400">{catalog.call.length} available</span>
                      </div>

                      <div className="space-y-3">
                        {catalog.call.map((item) => {
                          const isAssigned = !!subprojectAssignments[item.subprojectId];
                          const config = subprojectAssignments[item.subprojectId] || {};
                          const payrate = Number(item.hourlyPayout) || 25;
                          const defaultMargin = Number((payrate * 0.10).toFixed(2));
                          const currentVal = (config.baseRate !== undefined && config.baseRate !== null && config.baseRate !== "" && Number(config.baseRate) <= payrate)
                            ? config.baseRate
                            : defaultMargin;
                          const currentPct = (payrate > 0 && typeof currentVal === "number")
                            ? Math.round((currentVal / payrate) * 100)
                            : 10;

                          return (
                            <div
                              key={item.subprojectId}
                              className={`p-3.5 rounded-xl border transition-all ${
                                isAssigned
                                  ? "bg-neutral-900 border-primary-500/40"
                                  : "bg-neutral-900/40 border-neutral-800/70 opacity-75"
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isAssigned}
                                    onChange={() => toggleSubproject(item)}
                                    className="w-4 h-4 accent-primary-500 rounded"
                                  />
                                  <div>
                                    <span className="font-semibold text-sm text-neutral-200">{item.subprojectName}</span>
                                    <span className="text-[11px] text-emerald-400 font-semibold block">
                                      Contributor Payrate: ${Number(item.hourlyPayout || 0).toFixed(2)}/hr
                                    </span>
                                  </div>
                                </label>

                                {isAssigned && (
                                  activeVendor.isStudio ? (
                                    <div className="flex flex-col sm:items-end gap-1 pl-7 sm:pl-0">
                                      <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-300 text-xs font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                        Studio Partner (Project Rate Split)
                                      </div>
                                      <span className="text-[10px] text-purple-300/80 font-medium">
                                        Artist Pay + Studio Margin = ${payrate.toFixed(2)}/hr
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-end gap-1 pl-7 sm:pl-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-neutral-400 font-medium">Vendor Margin:</span>
                                        <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1">
                                          <span className="text-xs text-neutral-400 font-bold">$</span>
                                          <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            value={currentVal}
                                            onChange={(e) => {
                                              const val = e.target.value === "" ? "" : parseFloat(e.target.value);
                                              setSubprojectAssignments((prev) => ({
                                                ...prev,
                                                [item.subprojectId]: { ...prev[item.subprojectId], baseRate: val, unitLabel: "approved hr" }
                                              }));
                                            }}
                                            className="w-16 bg-transparent text-sm font-bold text-white text-right focus:outline-none"
                                          />
                                          <span className="text-xs text-neutral-400">/ approved hr</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSubprojectAssignments((prev) => ({
                                                ...prev,
                                                [item.subprojectId]: { ...prev[item.subprojectId], baseRate: defaultMargin, unitLabel: "approved hr" }
                                              }));
                                            }}
                                            title="Click to reset to 10% of contributor payrate"
                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors cursor-pointer"
                                          >
                                            {currentPct}%
                                          </button>
                                        </div>
                                      </div>
                                      <div className="text-[10px] text-neutral-400 font-medium">
                                        Prefilled: 10% (${defaultMargin.toFixed(2)}/hr)
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ─── 2. SCRIPTED CALL VERTICAL (If Ticked) ─── */}
                  {selectedCategories.scripted_call && (
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                          <h4 className="text-sm font-bold text-white">Scripted Call Sub-Projects</h4>
                        </div>
                        <span className="text-xs text-neutral-400">{catalog.scripted_call.length} available</span>
                      </div>

                      <div className="space-y-3">
                        {catalog.scripted_call.map((item) => {
                          const isAssigned = !!subprojectAssignments[item.subprojectId];
                          const config = subprojectAssignments[item.subprojectId] || {};
                          const payrate = Number(item.hourlyPayout) || 25;
                          const defaultMargin = Number((payrate * 0.10).toFixed(2));
                          const currentVal = (config.baseRate !== undefined && config.baseRate !== null && config.baseRate !== "" && Number(config.baseRate) <= payrate)
                            ? config.baseRate
                            : defaultMargin;
                          const currentPct = (payrate > 0 && typeof currentVal === "number")
                            ? Math.round((currentVal / payrate) * 100)
                            : 10;

                          return (
                            <div
                              key={item.subprojectId}
                              className={`p-3.5 rounded-xl border transition-all ${
                                isAssigned
                                  ? "bg-neutral-900 border-cyan-500/40"
                                  : "bg-neutral-900/40 border-neutral-800/70 opacity-75"
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isAssigned}
                                    onChange={() => toggleSubproject(item)}
                                    className="w-4 h-4 accent-cyan-500 rounded"
                                  />
                                  <div>
                                    <span className="font-semibold text-sm text-neutral-200">{item.subprojectName}</span>
                                    <span className="text-[11px] text-emerald-400 font-semibold block">
                                      Contributor Payrate: ${Number(item.hourlyPayout || 0).toFixed(2)}/hr
                                    </span>
                                  </div>
                                </label>

                                {isAssigned && (
                                  activeVendor.isStudio ? (
                                    <div className="flex flex-col sm:items-end gap-1 pl-7 sm:pl-0">
                                      <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-300 text-xs font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                        Studio Partner (Project Rate Split)
                                      </div>
                                      <span className="text-[10px] text-purple-300/80 font-medium">
                                        Artist Pay + Studio Margin = ${payrate.toFixed(2)}/hr
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-end gap-1 pl-7 sm:pl-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-neutral-400 font-medium">Vendor Margin:</span>
                                        <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1">
                                          <span className="text-xs text-neutral-400 font-bold">$</span>
                                          <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            value={currentVal}
                                            onChange={(e) => {
                                              const val = e.target.value === "" ? "" : parseFloat(e.target.value);
                                              setSubprojectAssignments((prev) => ({
                                                ...prev,
                                                [item.subprojectId]: { ...prev[item.subprojectId], baseRate: val, unitLabel: "approved hr" }
                                              }));
                                            }}
                                            className="w-16 bg-transparent text-sm font-bold text-white text-right focus:outline-none"
                                          />
                                          <span className="text-xs text-neutral-400">/ approved hr</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSubprojectAssignments((prev) => ({
                                                ...prev,
                                                [item.subprojectId]: { ...prev[item.subprojectId], baseRate: defaultMargin, unitLabel: "approved hr" }
                                              }));
                                            }}
                                            title="Click to reset to 10% of contributor payrate"
                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors cursor-pointer"
                                          >
                                            {currentPct}%
                                          </button>
                                        </div>
                                      </div>
                                      <div className="text-[10px] text-neutral-400 font-medium">
                                        Prefilled: 10% (${defaultMargin.toFixed(2)}/hr)
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ─── 3. PHRASES VERTICAL (If Ticked) ─── */}
                  {selectedCategories.phrase && (
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <h4 className="text-sm font-bold text-white">Phrase Datasets & Sub-Projects</h4>
                        </div>
                        <span className="text-xs text-neutral-400">{catalog.phrase.length} available</span>
                      </div>

                      <div className="space-y-3">
                        {catalog.phrase.map((item) => {
                          const isAssigned = !!subprojectAssignments[item.subprojectId];
                          const config = subprojectAssignments[item.subprojectId] || {};
                          const payrate = Number(item.hourlyPayout) || 25;
                          const defaultMargin = Number((payrate * 0.10).toFixed(2));
                          const currentVal = (config.baseRate !== undefined && config.baseRate !== null && config.baseRate !== "" && Number(config.baseRate) <= payrate)
                            ? config.baseRate
                            : defaultMargin;
                          const currentPct = (payrate > 0 && typeof currentVal === "number")
                            ? Math.round((currentVal / payrate) * 100)
                            : 10;

                          return (
                            <div
                              key={item.subprojectId}
                              className={`p-3.5 rounded-xl border transition-all ${
                                isAssigned
                                  ? "bg-neutral-900 border-emerald-500/40"
                                  : "bg-neutral-900/40 border-neutral-800/70 opacity-75"
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isAssigned}
                                    onChange={() => toggleSubproject(item)}
                                    className="w-4 h-4 accent-emerald-500 rounded"
                                  />
                                  <div>
                                    <span className="font-semibold text-sm text-neutral-200">{item.subprojectName}</span>
                                    <span className="text-[11px] text-emerald-400 font-semibold block">
                                      Contributor Payrate: ${Number(item.hourlyPayout || 0).toFixed(2)}/hr
                                    </span>
                                  </div>
                                </label>

                                {isAssigned && (
                                  activeVendor.isStudio ? (
                                    <div className="flex flex-col sm:items-end gap-1 pl-7 sm:pl-0">
                                      <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-300 text-xs font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                        Studio Partner (Project Rate Split)
                                      </div>
                                      <span className="text-[10px] text-purple-300/80 font-medium">
                                        Artist Pay + Studio Margin = ${payrate.toFixed(2)}/hr
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-end gap-1 pl-7 sm:pl-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-neutral-400 font-medium">Vendor Margin:</span>
                                        <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1">
                                          <span className="text-xs text-neutral-400 font-bold">$</span>
                                          <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            value={currentVal}
                                            onChange={(e) => {
                                              const val = e.target.value === "" ? "" : parseFloat(e.target.value);
                                              setSubprojectAssignments((prev) => ({
                                                ...prev,
                                                [item.subprojectId]: { ...prev[item.subprojectId], baseRate: val, unitLabel: "approved hr" }
                                              }));
                                            }}
                                            className="w-16 bg-transparent text-sm font-bold text-white text-right focus:outline-none"
                                          />
                                          <span className="text-xs text-neutral-400">/ approved hr</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSubprojectAssignments((prev) => ({
                                                ...prev,
                                                [item.subprojectId]: { ...prev[item.subprojectId], baseRate: defaultMargin, unitLabel: "approved hr" }
                                              }));
                                            }}
                                            title="Click to reset to 10% of contributor payrate"
                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors cursor-pointer"
                                          >
                                            {currentPct}%
                                          </button>
                                        </div>
                                      </div>
                                      <div className="text-[10px] text-neutral-400 font-medium">
                                        Prefilled: 10% (${defaultMargin.toFixed(2)}/hr)
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>

                              {/* Language Selection Pills / Checkboxes */}
                              {isAssigned && item.languages && item.languages.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-neutral-800/80 pl-7 sm:pl-7">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300">
                                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>Assigned Languages:</span>
                                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-emerald-400 border border-neutral-700 font-mono">
                                        {(config.assignedLanguages || item.languages).length} of {item.languages.length} selected
                                      </span>
                                    </div>
                                    {item.languages.length > 1 && (
                                      <div className="flex items-center gap-2 text-[11px]">
                                        <button
                                          type="button"
                                          onClick={() => selectAllLanguagesForSubproject(item.subprojectId, item.languages)}
                                          className="text-primary-400 hover:text-primary-300 transition-colors cursor-pointer font-medium"
                                        >
                                          Select All
                                        </button>
                                        <span className="text-neutral-600">|</span>
                                        <button
                                          type="button"
                                          onClick={() => clearLanguagesForSubproject(item.subprojectId, item.languages)}
                                          className="text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer font-medium"
                                        >
                                          Clear Others
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    {item.languages.map((lang) => {
                                      const langLower = String(lang).toLowerCase().trim();
                                      const selectedList = (config.assignedLanguages || item.languages).map((l) =>
                                        String(l).toLowerCase().trim()
                                      );
                                      const isSelected = selectedList.includes(langLower);
                                      return (
                                        <button
                                          key={lang}
                                          type="button"
                                          onClick={() => toggleLanguageForSubproject(item.subprojectId, langLower, item.languages)}
                                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                                            isSelected
                                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-950/40"
                                              : "bg-neutral-950 text-neutral-500 border-neutral-800 hover:border-neutral-700 hover:text-neutral-300"
                                          }`}
                                        >
                                          <div
                                            className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[10px] ${
                                              isSelected
                                                ? "bg-emerald-500 border-emerald-400 text-black font-bold"
                                                : "border-neutral-700 bg-neutral-900"
                                            }`}
                                          >
                                            {isSelected && "✓"}
                                          </div>
                                          <span className="capitalize">{lang}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Policy Notice */}
                {activeVendor.isStudio ? (
                  <div className="bg-purple-950/25 border border-purple-500/30 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-white">Studio Partner Compensation Policy</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Studio accounts do not receive platform margin deductions; voice artists receive direct payouts from DataCatalyst at the customized rates configured by the studio when creating artist profiles.
                    </p>
                  </div>
                ) : (
                  <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-2xl p-4 flex items-start gap-3">
                    <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl shrink-0 mt-0.5">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block mb-0.5">Direct Hourly Margin Payout Guarantee</span>
                      <p className="text-xs text-neutral-300 leading-relaxed">
                        The margin rate configured above is in USD ($/approved hr) and paid 100% directly to this vendor for every approved audio hour delivered by their community across calls, scripted sessions, and phrase recordings. Contributors are paid separately at standard platform rates.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  Total Active Sub-projects:{" "}
                  <span className="text-white font-bold">
                    {Object.values(subprojectAssignments).filter((p) => selectedCategories[p.category]).length}
                  </span>
                </span>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingAssignments}
                    onClick={saveAssignments}
                    className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-lg shadow-primary-600/25 transition-all"
                  >
                    {savingAssignments ? "Saving Assignments..." : "Save Project Assignments"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL 3: COMMUNITY ROSTER DRAWER ──────────────────────────────── */}
      <AnimatePresence>
        {showCommunityModal && activeVendor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary-600/20 text-primary-400 border border-primary-500/30">
                      {activeVendor.vendorCode}
                    </span>
                    <h3 className="text-lg font-bold text-white">Community Workers Roster</h3>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Contributors registered under <span className="text-white font-semibold">{activeVendor.name}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowCommunityModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingCommunity ? (
                  <div className="py-20 text-center text-neutral-400 text-sm">Loading community members...</div>
                ) : communityData.length === 0 ? (
                  <div className="py-16 text-center">
                    <UsersRound className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                    <h4 className="text-base font-bold text-white">No Workers Enrolled Yet</h4>
                    <p className="text-xs text-neutral-400 mt-1 mb-4">
                      Share the invite link with the vendor to start onboarding contributors.
                    </p>
                    <button
                      onClick={() => copyInviteLink(activeVendor.vendorCode)}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl"
                    >
                      Copy Agency Invite Link
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-neutral-800 text-neutral-400 uppercase font-semibold">
                        <tr>
                          <th className="py-3 px-3">Contributor</th>
                          <th className="py-3 px-3">Speaker ID</th>
                          <th className="py-3 px-3">Phone</th>
                          <th className="py-3 px-3">Approval Rate</th>
                          <th className="py-3 px-3">Completed Tasks</th>
                          <th className="py-3 px-3">Direct UPI Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/60">
                        {communityData.map((worker) => (
                          <tr key={worker._id} className="hover:bg-neutral-800/30 transition-colors">
                            <td className="py-3 px-3">
                              <div className="font-semibold text-white">
                                {`${worker.firstname || ""} ${worker.lastname || ""}`.trim() || worker.username}
                              </div>
                              <div className="text-neutral-500 text-[11px]">{worker.email}</div>
                            </td>
                            <td className="py-3 px-3 font-mono text-neutral-300">{worker.speaker_id || "N/A"}</td>
                            <td className="py-3 px-3 text-neutral-400">{worker.mobileNumber || "N/A"}</td>
                            <td className="py-3 px-3">
                              <span
                                className={`font-bold px-2 py-0.5 rounded ${
                                  worker.approvalRate >= 90
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : worker.approvalRate >= 80
                                    ? "bg-amber-500/15 text-amber-400"
                                    : "bg-rose-500/15 text-rose-400"
                                }`}
                              >
                                {worker.approvalRate}%
                              </span>
                            </td>
                            <td className="py-3 px-3 text-neutral-300">
                              {worker.approvedPhrases + worker.approvedCalls} approved
                            </td>
                            <td className="py-3 px-3">
                              {worker.upiId ? (
                                <span className="text-emerald-400 font-medium flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Direct UPI Configured
                                </span>
                              ) : (
                                <span className="text-neutral-500">Pending Setup</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
