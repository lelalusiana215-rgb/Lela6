/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, Edit2, Trash2, X, Save, 
  Download, Upload, AlertCircle, CheckCircle2, FileUp, Loader2,
  Building2, Users, LayoutDashboard, Copy, ExternalLink, Settings
} from 'lucide-react';
import { 
  collection, onSnapshot, query, doc, getDoc,
  setDoc, deleteDoc, serverTimestamp, orderBy, writeBatch, getDocs
} from 'firebase/firestore';
import { utils, read, writeFile } from 'xlsx';
import { db, OperationType, handleFirestoreError } from '../lib/firebase.ts';
import type { Student, School, AdminUser } from '../types.ts';
import { motion, AnimatePresence } from 'motion/react';

import { useFirebase } from './FirebaseContext.tsx';

type AdminTab = 'students' | 'schools' | 'admins' | 'tka';

export default function AdminPanel() {
  const { user, adminSchools, isSuperAdmin } = useFirebase();
  const [activeTab, setActiveTab] = useState<AdminTab>('students');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [schoolData, setSchoolData] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [schoolsList, setSchoolsList] = useState<School[]>([]);
  const [adminsList, setAdminsList] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Student>>({
    nisn: '',
    nama: '',
    kelas: '',
    status: 'LULUS'
  });

  const [schoolFormData, setSchoolFormData] = useState<Partial<School>>({
    id: '',
    name: '',
    year: '2025/2026'
  });

  const [adminFormData, setAdminFormData] = useState<Partial<AdminUser>>({
    email: '',
    schoolIds: []
  });

  // Fetch schools for all admins (to resolve names and IDs)
  useEffect(() => {
    if (!user) {
      setSchoolsList([]);
      return;
    }
    // Schools are now readable by any signed in user in firestore.rules
    const unsubscribe = onSnapshot(collection(db, 'schools'), (snapshot) => {
      const schools = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as School));
      setSchoolsList(schools);
    }, (error) => {
      console.error("Error fetching schools:", error);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch all admins for super admin
  useEffect(() => {
    if (!isSuperAdmin || !user) {
      setAdminsList([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, 'admins'), (snapshot) => {
      const admins = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          email: doc.id, 
          schoolIds: data.schoolIds || [] 
        } as AdminUser;
      });
      setAdminsList(admins);
    }, (error) => {
      console.error("Error fetching admins:", error);
    });
    return () => unsubscribe();
  }, [isSuperAdmin, user]);

  // Set initial selected school
  useEffect(() => {
    const availableIds = isSuperAdmin 
      ? [...new Set([...schoolsList.map(s => s.id), ...adminSchools, ...adminsList.flatMap(a => a.schoolIds)])]
      : adminSchools;

    if (availableIds.length > 0 && !selectedSchoolId) {
      setSelectedSchoolId(availableIds[0]);
    }
  }, [adminSchools, isSuperAdmin, schoolsList, adminsList, selectedSchoolId]);

  // Fetch school metadata and student list
  useEffect(() => {
    if (!selectedSchoolId || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Fetch School metadata
    const schoolRef = doc(db, 'schools', selectedSchoolId);
    getDoc(schoolRef).then(snap => {
      if (snap.exists()) setSchoolData(snap.data());
    });

    const q = query(
      collection(db, 'schools', selectedSchoolId, 'students')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data() } as Student));
      setStudents(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `schools/${selectedSchoolId}/students`);
    });

    return () => unsubscribe();
  }, [selectedSchoolId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nisn || !formData.nama || !formData.kelas || !formData.status || !selectedSchoolId) return;

    try {
      const studentId = formData.nisn;
      const studentPath = `schools/${selectedSchoolId}/students/${studentId}`;
      await setDoc(doc(db, 'schools', selectedSchoolId, 'students', studentId), {
        ...formData,
        schoolId: selectedSchoolId,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setIsAdding(false);
      setIsEditing(null);
      setFormData({ nisn: '', nama: '', kelas: '', status: 'LULUS' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `schools/${selectedSchoolId}/students/${formData.nisn}`);
    }
  };

  const handleDelete = async (nisn: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    try {
      await deleteDoc(doc(db, 'schools', selectedSchoolId, 'students', nisn));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schools/${selectedSchoolId}/students/${nisn}`);
    }
  };

  const startEdit = (student: Student) => {
    setFormData(student);
    setIsEditing(student.nisn);
    setIsAdding(false);
  };

  const downloadTemplate = () => {
    const headers = [["NISN", "Nama", "Kelas", "Status", "TKA_Matematika", "TKA_Bahasa", "TKA_Peringkat"]];
    const exampleData = [
      ["0123456789", "Ahmad Fauzi", "VI A", "LULUS", "85", "90", "1"],
      ["0123456790", "Siti Aisyah", "VI A", "LULUS", "88", "85", "2"],
      ["0123456791", "Budi Santoso", "VI B", "TIDAK LULUS", "70", "75", "45"]
    ];
    
    const worksheet = utils.aoa_to_sheet([...headers, ...exampleData]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, "Template Siswa");
    
    writeFile(workbook, `Template_Impor_${selectedSchoolId || 'Siswa'}.xlsx`);
  };

  const handleImportClick = () => {
    if (!selectedSchoolId) return alert("Pilih sekolah terlebih dahulu");
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSchoolId) return;

    setImporting(true);
    setImportMessage(null);

    try {
      const dataBuffer = await file.arrayBuffer();
      const workbook = read(new Uint8Array(dataBuffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = utils.sheet_to_json(worksheet) as any[];

      if (rawData.length === 0) {
        throw new Error("File Excel kosong atau format tidak sesuai.");
      }

      // Normalize data keys to be more flexible (lowercase, alphanumeric only)
      const data = rawData.map(row => {
        const normalizedRow: any = {};
        Object.keys(row).forEach(key => {
          const normalizedKey = key.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
          normalizedRow[normalizedKey] = row[key];
        });
        return normalizedRow;
      });

      const batch = writeBatch(db);
      let count = 0;
      let tkaCount = 0;

      for (const item of data) {
        let rawNisn = String(item.nisn || item.nis || item.nomorinduk || item.noinduk || "").trim();
        const nisn = rawNisn.replace(/[^a-zA-Z0-9_\-]/g, '');
        
        if (!nisn || nisn === "undefined" || nisn === "null") continue;

        const studentData: any = {
          nisn,
          updatedAt: serverTimestamp(),
          schoolId: selectedSchoolId,
        };

        const mergeFields: string[] = ['nisn', 'updatedAt', 'schoolId'];

        // Core fields
        const nama = item.nama || item.namalengkap || item.nama_lengkap || item.fullname || item.full_name;
        if (nama) {
          studentData.nama = String(nama).trim();
          mergeFields.push('nama');
        }

        const kelas = item.kelas || item.class || item.tingkat;
        if (kelas) {
          studentData.kelas = String(kelas).trim();
          mergeFields.push('kelas');
        }
        
        let statusStr = item.status || item.ket || item.keterangan;
        if (statusStr) {
          statusStr = String(statusStr).trim().toUpperCase();
          if (statusStr === 'LULUS' || statusStr === 'TIDAK LULUS') {
            studentData.status = statusStr;
            mergeFields.push('status');
          }
        }

        // TKA score fields with broad aliases
        const mtk = item.tkamatematika ?? item.matematika ?? item.mtk ?? item.tkamtk ?? item.mat ?? item.tkamat ?? null;
        const bind = item.tkabahasa ?? item.tkabahasaindonesia ?? item.bahasaindonesia ?? item.bahasa ?? item.bind ?? item.tkabind ?? item.bindo ?? item.tkabindo ?? null;
        const rank = item.tkaperingkat ?? item.peringkat ?? item.rank ?? item.tkarank ?? item.ranking ?? null;

        const mtkVal = (mtk !== null && String(mtk).trim() !== "") ? parseFloat(String(mtk)) : null;
        const bindVal = (bind !== null && String(bind).trim() !== "") ? parseFloat(String(bind)) : null;
        const rankVal = (rank !== null && String(rank).trim() !== "") ? parseInt(String(rank)) : null;

        if (mtkVal !== null || bindVal !== null || rankVal !== null) {
          studentData.tka = {};
          let hasScore = false;

          if (mtkVal !== null && !isNaN(mtkVal)) {
            studentData.tka.matematika = mtkVal;
            mergeFields.push('tka.matematika');
            hasScore = true;
          }
          if (bindVal !== null && !isNaN(bindVal)) {
            studentData.tka.bahasaIndonesia = bindVal;
            mergeFields.push('tka.bahasaIndonesia');
            hasScore = true;
          }
          if (rankVal !== null && !isNaN(rankVal)) {
            studentData.tka.peringkat = rankVal;
            mergeFields.push('tka.peringkat');
          }

          if (hasScore) {
            const m = (mtkVal !== null && !isNaN(mtkVal)) ? mtkVal : 0;
            const b = (bindVal !== null && !isNaN(bindVal)) ? bindVal : 0;
            studentData.tka.total = Math.round((m + b) * 100) / 100;
            mergeFields.push('tka.total');
            tkaCount++;
          }
        }

        const docRef = doc(db, 'schools', selectedSchoolId, 'students', nisn);
        batch.set(docRef, studentData, { mergeFields });
        count++;
      }

      if (count === 0) {
        throw new Error("Tidak ada data valid yang ditemukan untuk diimpor. Pastikan kolom NISN ada.");
      }

      await batch.commit();
      setImportMessage({ 
        type: 'success', 
        text: `Berhasil mengimpor ${count} data (${tkaCount} dengan nilai TKA).` 
      });
    } catch (error) {
      console.error("Import error:", error);
      setImportMessage({ type: 'error', text: error instanceof Error ? error.message : "Gagal mengimpor data." });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolFormData.id || !schoolFormData.name) return;

    try {
      const sId = schoolFormData.id.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'schools', sId), {
        ...schoolFormData,
        id: sId
      });
      setIsAddingSchool(false);
      setSchoolFormData({ id: '', name: '', year: '2025/2026' });
    } catch (error: any) {
      console.error("Save school error:", error);
      alert(error.message || "Gagal menyimpan data sekolah.");
    }
  };

  const handleDeleteSchool = async (sId: string) => {
    if (!confirm('Menghapus sekolah akan menghapus akses tetapi TIDAK menghapus data siswa di dalamnya secara otomatis. Lanjutkan?')) return;
    try {
      await deleteDoc(doc(db, 'schools', sId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schools/${sId}`);
    }
  };

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminFormData.email || !adminFormData.schoolIds || adminFormData.schoolIds.length === 0) {
      alert("Email dan minimal satu sekolah harus dipilih.");
      return;
    }

    try {
      const email = adminFormData.email.toLowerCase().trim();
      await setDoc(doc(db, 'admins', email), {
        schoolIds: adminFormData.schoolIds
      });
      setIsAddingAdmin(false);
      setAdminFormData({ email: '', schoolIds: [] });
    } catch (error: any) {
      console.error("Save admin error:", error);
      alert(error.message || "Gagal menyimpan data admin.");
    }
  };

  const handleDeleteAdmin = async (email: string) => {
    if (!confirm(`Hapus akses admin untuk ${email}?`)) return;
    try {
      await deleteDoc(doc(db, 'admins', email));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `admins/${email}`);
    }
  };

  const filteredStudents = students.filter(s => 
    (s.nama || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.nisn || '').includes(searchTerm)
  ).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100 w-fit overflow-x-auto max-w-full">
          <button 
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
              activeTab === 'students' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Siswa
          </button>
          <button 
            onClick={() => setActiveTab('tka')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
              activeTab === 'tka' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <FileUp className="w-4 h-4" />
            Data TKA
          </button>
          {isSuperAdmin && (
            <>
              <button 
                onClick={() => setActiveTab('schools')}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
                  activeTab === 'schools' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4" />
                Sekolah
              </button>
              <button 
                onClick={() => setActiveTab('admins')}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
                  activeTab === 'admins' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-4 h-4" />
                Admin Khusus
              </button>
            </>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200">
            <div className={`w-2 h-2 rounded-full ${isSuperAdmin ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
            <span className="text-xs font-bold text-slate-600 truncate max-w-[200px]" title={user.email || user.displayName || ''}>
              {user.email || user.displayName || 'Admin'} {isSuperAdmin ? '(Super Admin)' : '(Admin)'}
            </span>
          </div>
        )}
      </div>

      {activeTab === 'students' ? (
        <>
          {(adminSchools.length > 1 || isSuperAdmin) && (
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center gap-4">
              <label className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                Sekolah Aktif:
              </label>
              <select 
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-bold text-blue-900 outline-none focus:border-blue-500"
              >
                {!selectedSchoolId && <option value="">-- Pilih Sekolah --</option>}
                {[...new Set([
                  ...(isSuperAdmin ? schoolsList.map(s => s.id) : []),
                  ...adminSchools,
                  ...(isSuperAdmin ? adminsList.flatMap(a => a.schoolIds) : [])
                ])].map(sid => (
                  <option key={sid} value={sid}>
                    {schoolsList.find(s => s.id === sid)?.name || sid}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Daftar Kelulusan</h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-slate-500 text-sm">
                  {schoolData?.name || selectedSchoolId || 'Pilih sekolah untuk mengelola data'}
                </p>
                {selectedSchoolId && (
                  <button 
                    onClick={() => {
                      const url = `${window.location.origin}/?s=${selectedSchoolId}`;
                      navigator.clipboard.writeText(url);
                      alert("Link sekolah berhasil disalin!");
                    }}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest border border-blue-100"
                    title="Salin link akses untuk siswa"
                  >
                    <Copy className="w-3 h-3" />
                    Salin Link Akses
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={downloadTemplate}
                disabled={!selectedSchoolId}
                className="flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all active:scale-95 text-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Template
              </button>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
              <button 
                onClick={handleImportClick}
                disabled={importing || !selectedSchoolId}
                className="flex items-center gap-2 px-5 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold transition-all active:scale-95 text-sm disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                Impor
              </button>

              <button 
                onClick={() => {
                  if (!selectedSchoolId) return alert("Pilih sekolah terlebih dahulu");
                  setIsAdding(true);
                  setIsEditing(null);
                  setFormData({ nisn: '', nama: '', kelas: '', status: 'LULUS' });
                }}
                disabled={!selectedSchoolId}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 text-sm disabled:opacity-50"
              >
                <Plus className="w-5 h-5" />
                Siswa Baru
              </button>
            </div>
          </div>

          <AnimatePresence>
            {importMessage && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`p-4 rounded-2xl flex items-center gap-3 border ${
                  importMessage.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                    : 'bg-red-50 border-red-100 text-red-800'
                }`}
              >
                {importMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="text-sm font-medium">{importMessage.text}</span>
                <button onClick={() => setImportMessage(null)} className="ml-auto">
                  <X className="w-4 h-4 opacity-50 hover:opacity-100" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  type="text"
                  placeholder="Cari berdasarkan nama atau NISN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
              <div className="text-sm text-slate-400 font-medium">
                Total: <span className="text-slate-800 font-bold">{filteredStudents.length}</span> Siswa
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Siswa</th>
                    <th className="px-6 py-4">NISN</th>
                    <th className="px-6 py-4">Kelas</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredStudents.map((student) => (
                    <tr key={student.nisn} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{student.nama}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-slate-500">{student.nisn}</td>
                      <td className="px-6 py-4 text-slate-600">{student.kelas}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${
                          student.status === 'LULUS' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {student.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-2">
                          <button 
                            onClick={() => startEdit(student)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(student.nisn)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                        Tidak ada data siswa ditemukan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'tka' ? (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Manajemen Hasil TKA</h2>
              <p className="text-slate-500 text-sm">
                Kelola nilai Tes Kompetensi Akademik siswa 
                ({students.filter(s => s.tka).length} dari {students.length} siswa memiliki nilai)
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={() => {
                  const headers = [["NISN", "Nama", "TKA_Matematika", "TKA_Bahasa", "TKA_Peringkat"]];
                  const example = [["0123456789", "Ahmad Fauzi", "85", "90", "1"]];
                  const ws = utils.aoa_to_sheet([...headers, ...example]);
                  const wb = utils.book_new();
                  utils.book_append_sheet(wb, ws, "Template_TKA");
                  writeFile(wb, "Template_TKA_Siswa.xlsx");
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-all text-sm"
              >
                <Download className="w-4 h-4" />
                Template TKA
              </button>
              
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  id="tka-upload"
                  className="hidden"
                  disabled={importing || !selectedSchoolId}
                />
                <label 
                  htmlFor="tka-upload"
                  className={`flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer text-sm ${(!selectedSchoolId || importing) ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Impor Skor TKA
                </label>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  type="text"
                  placeholder="Cari berdasarkan nama atau NISN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
              <div className="text-sm text-slate-400 font-medium">
                Menampilkan <span className="text-slate-800 font-bold">{filteredStudents.length}</span> Siswa
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Siswa</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">MTK</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">B. INDO</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center font-black">TOTAL</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center text-amber-600">RANK</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredStudents.map((student) => (
                    <tr key={student.nisn} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{student.nama}</p>
                        <p className="text-xs text-slate-400">{student.nisn}</p>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-sm">{student.tka?.matematika ?? '-'}</td>
                      <td className="px-6 py-4 text-center font-mono text-sm">{student.tka?.bahasaIndonesia ?? '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-black">
                          {student.tka?.total !== undefined ? Number(student.tka.total).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-amber-600 font-black">
                          {student.tka?.peringkat ? `#${student.tka.peringkat}` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => {
                            setIsEditing(student.nisn);
                            setFormData(student);
                          }}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                        {searchTerm ? 'Pencarian tidak ditemukan' : 'Belum ada data siswa di sekolah ini'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'schools' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Daftar Sekolah</h2>
              <p className="text-slate-500 text-sm">Kelola instansi yang terdaftar di sistem</p>
            </div>
            <button 
              onClick={() => setIsAddingSchool(true)}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95"
            >
              <Building2 className="w-5 h-5" />
              Sekolah Baru
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {schoolsList.map(school => (
              <motion.div 
                layout
                key={school.id}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <button 
                    onClick={() => handleDeleteSchool(school.id)}
                    className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">{school.name}</h3>
                <p className="text-sm text-slate-500 mb-4">ID: <span className="font-mono">{school.id}</span></p>
                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{school.year}</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setSelectedSchoolId(school.id);
                        setActiveTab('students');
                      }}
                      className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Kelola Siswa
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Akses Admin Khusus</h2>
              <p className="text-slate-500 text-sm">Tentukan admin untuk masing-masing sekolah</p>
            </div>
            <button 
              onClick={() => {
                setIsAddingAdmin(true);
                setAdminFormData({ email: '', schoolIds: [] });
              }}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95"
            >
              <Settings className="w-5 h-5" />
              Tambah Admin
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {adminsList.map(admin => (
              <motion.div 
                layout
                key={admin.email}
                className={`bg-white p-6 rounded-3xl border shadow-sm hover:shadow-md transition-all ${
                  admin.email === 'lelalusiana215@gmail.com' ? 'border-blue-200 bg-blue-50/10' : 'border-slate-100'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-2xl ${
                    admin.email === 'lelalusiana215@gmail.com' ? 'bg-blue-100 text-blue-600' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    <Users className="w-6 h-6" />
                  </div>
                  {admin.email !== 'lelalusiana215@gmail.com' && (
                    <button 
                      onClick={() => handleDeleteAdmin(admin.email)}
                      className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1 truncate" title={admin.email}>
                  {admin.email} {admin.email === 'lelalusiana215@gmail.com' && <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full ml-1">SUPER</span>}
                </h3>
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Akses Sekolah:</p>
                  <div className="flex flex-wrap gap-2">
                    {admin.email === 'lelalusiana215@gmail.com' ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded-lg text-[10px] font-bold">Semua Sekolah</span>
                    ) : (
                      admin.schoolIds.map(sid => (
                        <span key={sid} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold">
                          {schoolsList.find(s => s.id === sid)?.name || sid}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
            {adminsList.length === 0 && (
              <div className="col-span-full py-12 text-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400">
                Belum ada admin khusus yang ditambahkan
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Modal */}
      {isAddingAdmin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="bg-indigo-600 p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Tambah Admin Sekolah</h3>
              <button 
                onClick={() => setIsAddingAdmin(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveAdmin} className="p-8 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email Admin</label>
                <input 
                  type="email"
                  required
                  value={adminFormData.email}
                  onChange={(e) => setAdminFormData({...adminFormData, email: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-500 focus:outline-none transition-all"
                  placeholder="admin-sekolah@gmail.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Pilih Sekolah (Bisa multi)</label>
                <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-100 p-3 rounded-xl bg-slate-50">
                  {schoolsList.map(school => (
                    <label key={school.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-all">
                      <input 
                        type="checkbox"
                        checked={adminFormData.schoolIds?.includes(school.id)}
                        onChange={(e) => {
                          const ids = adminFormData.schoolIds || [];
                          if (e.target.checked) {
                            setAdminFormData({...adminFormData, schoolIds: [...ids, school.id]});
                          } else {
                            setAdminFormData({...adminFormData, schoolIds: ids.filter(id => id !== school.id)});
                          }
                        }}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-slate-700">{school.name}</span>
                    </label>
                  ))}
                  {schoolsList.length === 0 && <p className="text-xs text-slate-400 italic">Tambahkan sekolah terlebih dahulu</p>}
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg"
              >
                Simpan Akses Admin
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* School Modal */}
      {isAddingSchool && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="bg-slate-900 p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Tambah Sekolah Baru</h3>
              <button 
                onClick={() => setIsAddingSchool(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveSchool} className="p-8 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">ID Sekolah (URL-friendly)</label>
                <input 
                  type="text"
                  required
                  value={schoolFormData.id}
                  onChange={(e) => setSchoolFormData({...schoolFormData, id: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
                  placeholder="contoh: sdn3-ciomas"
                />
                <p className="text-[10px] text-slate-400 mt-1 italic">Link akses: ?s={schoolFormData.id || 'id-sekolah'}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Nama Sekolah</label>
                <input 
                  type="text"
                  required
                  value={schoolFormData.name}
                  onChange={(e) => setSchoolFormData({...schoolFormData, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
                  placeholder="Masukkan nama resmi sekolah..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tahun Pelajaran</label>
                <input 
                  type="text"
                  required
                  value={schoolFormData.year}
                  onChange={(e) => setSchoolFormData({...schoolFormData, year: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
                  placeholder="2025/2026"
                />
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg"
              >
                Simpan Sekolah
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {(isAdding || isEditing) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="bg-slate-900 p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                {isEditing ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
              </h3>
              <button 
                onClick={() => { setIsAdding(false); setIsEditing(null); }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-8 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">NISN (Nomor Induk Siswa Nasional)</label>
                <input 
                  type="text"
                  required
                  disabled={!!isEditing}
                  value={formData.nisn}
                  onChange={(e) => setFormData({...formData, nisn: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all disabled:opacity-50"
                  placeholder="Contoh: 0123456789"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Nama Lengkap</label>
                <input 
                  type="text"
                  required
                  value={formData.nama}
                  onChange={(e) => setFormData({...formData, nama: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
                  placeholder="Masukkan nama lengkap..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Kelas</label>
                  <input 
                    type="text"
                    required
                    value={formData.kelas}
                    onChange={(e) => setFormData({...formData, kelas: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
                    placeholder="VI A"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Status</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
                  >
                    <option value="LULUS">LULUS</option>
                    <option value="TIDAK LULUS">TIDAK LULUS</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-blue-500" />
                  Hasil TKA (Opsional)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">MTK</label>
                    <input 
                      type="number"
                      value={formData.tka?.matematika || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFormData({
                          ...formData, 
                          tka: { 
                            ...(formData.tka || { total: 0, bahasaIndonesia: 0 }), 
                            matematika: val,
                            total: Math.round((val + (formData.tka?.bahasaIndonesia || 0)) * 100) / 100
                          } 
                        })
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg focus:border-blue-500 outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bahasa</label>
                    <input 
                      type="number"
                      value={formData.tka?.bahasaIndonesia || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFormData({
                          ...formData, 
                          tka: { 
                            ...(formData.tka || { total: 0, matematika: 0 }), 
                            bahasaIndonesia: val,
                            total: Math.round(((formData.tka?.matematika || 0) + val) * 100) / 100
                          } 
                        })
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg focus:border-blue-500 outline-none transition-all text-sm"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Peringkat</label>
                  <input 
                    type="number"
                    value={formData.tka?.peringkat || ''}
                    onChange={(e) => setFormData({
                      ...formData, 
                      tka: { ...(formData.tka || { total: 0, matematika: 0, bahasaIndonesia: 0 }), peringkat: parseInt(e.target.value) || undefined } 
                    })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg focus:border-blue-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => { setIsAdding(false); setIsEditing(null); }}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
