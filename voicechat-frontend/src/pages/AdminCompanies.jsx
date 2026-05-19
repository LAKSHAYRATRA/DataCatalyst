import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2, Save, Loader2, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { apiGet, apiPostJson, apiPatchJson, apiDelete } from '../lib/api';
import AdminNav from '../components/AdminNav.jsx';
import Swal from 'sweetalert2';

export default function AdminCompanies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  
  const [newCompanyName, setNewCompanyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await apiGet('/api/admin/companies');
      setCompanies(res.companies || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleFieldChange = (companyId, field, value) => {
    setCompanies(prev => prev.map(c => {
      if (c._id !== companyId) return c;
      return { ...c, [field]: value };
    }));
  };

  const saveCompany = async (companyId) => {
    setSavingId(companyId);
    setMessage('');
    try {
      const company = companies.find(c => c._id === companyId);
      await apiPatchJson(`/api/admin/companies/${companyId}`, {
        maxContributionMinutes: Number(company.maxContributionMinutes),
        hourlyPayout: Number(company.hourlyPayout)
      });
      setMessage('Company saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      Swal.fire('Error', 'Failed to save company: ' + err.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const createCompany = async () => {
    if (!newCompanyName.trim()) return;
    setIsCreating(true);
    try {
      await apiPostJson('/api/admin/companies', {
        name: newCompanyName.trim(),
        maxContributionMinutes: 195,
        hourlyPayout: 0
      });
      setNewCompanyName('');
      setMessage('Company created successfully!');
      setTimeout(() => setMessage(''), 3000);
      fetchData();
    } catch (err) {
      Swal.fire('Error', 'Failed to create company: ' + err.message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteCompany = async (companyId, companyName) => {
    const confirm = await Swal.fire({
      title: "Delete Company?",
      text: `Are you sure you want to delete ${companyName}? This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!"
    });

    if (!confirm.isConfirmed) return;

    try {
      await apiDelete(`/api/admin/companies/${companyId}`);
      setMessage('Company deleted!');
      setTimeout(() => setMessage(''), 3000);
      fetchData();
    } catch (err) {
      Swal.fire('Error', 'Failed to delete company: ' + err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex transition-colors duration-300">
        <AdminNav />
        <main className="flex-1 md:ml-64 p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-8 max-w-6xl mx-auto text-neutral-900 dark:text-neutral-50">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-primary-500" />
                Company Configurations
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400">Manage custom contribution time limits and payrates per company.</p>
            </div>
            {message && (
              <span className="flex items-center gap-1 text-success-600 bg-success-100 dark:bg-success-900/30 px-4 py-2 rounded-lg font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" /> {message}
              </span>
            )}
          </div>
        </motion.div>

        {/* Create New Company Card */}
        <motion.div 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="card mb-8 flex flex-wrap items-end gap-4 bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30"
        >
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-semibold mb-2">Create New Company</label>
            <input 
              type="text" 
              className="input w-full" 
              placeholder="e.g. Acme Corp..." 
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createCompany()}
            />
          </div>
          <button 
            className="btn btn-primary flex items-center gap-2 h-[42px]"
            onClick={createCompany}
            disabled={isCreating || !newCompanyName.trim()}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Company
          </button>
        </motion.div>

        {companies.length === 0 ? (
          <div className="card text-center py-12">
            <Building2 className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Companies Found</h3>
            <p className="text-neutral-500">Upload phrases with a Company ID or create one above to get started.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {companies.map((company) => (
              <motion.div 
                key={company._id}
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="card"
              >
                <div className="flex items-center justify-between mb-6 border-b border-neutral-100 dark:border-neutral-800 pb-4">
                  <h2 className="text-xl font-bold">{company.name}</h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => deleteCompany(company._id, company.name)}
                      className="btn btn-sm bg-error-50 text-error-600 hover:bg-error-100 dark:bg-error-900/20 dark:hover:bg-error-900/40"
                      title="Delete Company"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => saveCompany(company._id)}
                      disabled={savingId === company._id}
                      className="btn btn-primary btn-sm flex items-center gap-2 px-4"
                    >
                      {savingId === company._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Contribution Limit */}
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                    <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Max Contribution Limit
                    </label>
                    <p className="text-xs text-neutral-500 mb-4">Total time allowed per contributor for this company</p>
                    
                    <div className="relative">
                      <input 
                        type="number"
                        min="0"
                        className="input w-full pr-16"
                        value={company.maxContributionMinutes !== undefined ? company.maxContributionMinutes : 195}
                        onChange={(e) => handleFieldChange(company._id, 'maxContributionMinutes', e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">Minutes</span>
                    </div>
                  </div>

                  {/* Hourly Payrate */}
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                    <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Flat Hourly Payrate
                    </label>
                    <p className="text-xs text-neutral-500 mb-4">Overrides project and language defaults (0 = use defaults)</p>
                    
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">$</span>
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        className="input w-full pl-7 pr-12"
                        value={company.hourlyPayout !== undefined ? company.hourlyPayout : 0}
                        onChange={(e) => handleFieldChange(company._id, 'hourlyPayout', e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">USD / hr</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
