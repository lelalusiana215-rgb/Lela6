/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { 
  GraduationCap, Search, Printer, AlertCircle, 
  CheckCircle2, ArrowLeft, Settings, LogIn, LogOut, Loader2, Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { doc, getDoc } from 'firebase/firestore';
import { db, login, logout, OperationType, handleFirestoreError } from './lib/firebase.ts';
import { useFirebase } from './components/FirebaseContext.tsx';
import type { Student, School } from './types.ts';
import AdminPanel from './components/AdminPanel.tsx';

type ViewState = 'search' | 'result' | 'admin' | 'error';
type SearchType = 'graduation' | 'tka';

// Portal Pengumuman Kelulusan - Trigger sync update
export default function App() {
  const { user, isAdmin, loading: authLoading } = useFirebase();
  const [nisn, setNisn] = useState('');
  const [currentView, setCurrentView] = useState<ViewState>('search');
  const [searchType, setSearchType] = useState<SearchType>('graduation');
  const [result, setResult] = useState<Student | null | 'NOT_FOUND'>(null);
  const [searching, setSearching] = useState(false);
  const [school, setSchool] = useState<School | null>(null);
  const [schoolLoading, setSchoolLoading] = useState(true);

  // Detect School ID from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const schoolId = params.get('s') || 'default'; // Generic default
    
    const fetchSchool = async () => {
      try {
        const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
        if (schoolSnap.exists()) {
          setSchool({ id: schoolId, ...schoolSnap.data() } as School);
        } else {
          // If school doesn't exist but it's the default, provide generic placeholder
          if (schoolId === 'default') {
             setSchool({ id: 'default', name: 'Portal Kelulusan Siswa', year: '2025/2026' });
          } else {
            setCurrentView('error');
          }
        }
      } catch (e) {
        console.error("Scale error: ", e);
      } finally {
        setSchoolLoading(false);
      }
    };

    fetchSchool();
  }, []);

  const burstConfetti = useCallback(() => {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const queryNisn = nisn.trim().replace(/\s+/g, ''); // Remove spaces
    if (!queryNisn || !school) return;

    setSearching(true);
    try {
      const docRef = doc(db, 'schools', school.id, 'students', queryNisn);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const student = docSnap.data() as Student;
        setResult(student);
        setCurrentView('result');
        if (student.status === 'LULUS') {
          burstConfetti();
        }
      } else {
        setResult('NOT_FOUND');
        setCurrentView('result');
      }
    } catch (error: any) {
      console.error("Search error:", error);
      // Don't throw, just show error UI
      setResult('NOT_FOUND'); 
      setCurrentView('result');
      // Optionally show alert if it's a permission issue
      if (error.code === 'permission-denied') {
        alert("Terjadi kesalahan izin akses. Pastikan link sekolah benar.");
      }
    } finally {
      setSearching(false);
    }
  };

  const resetSearch = () => {
    setCurrentView('search');
    setResult(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      await login();
      console.log("Login successful");
    } catch (error: any) {
      console.error("Login detail error:", error);
      const currentDomain = window.location.hostname;
      
      if (error.code === 'auth/popup-blocked') {
        alert("Pop-up login diblokir! Silakan izinkan pop-up atau klik 'Open in new tab' di pojok kanan atas preview AI Studio.");
      } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        // User closed
      } else if (error.code === 'auth/operation-not-allowed') {
        alert("Gagal: Google Auth belum diaktifkan di Firebase Console. Silakan buka Authentication > Sign-in method dan aktifkan Google.");
      } else if (error.code === 'auth/unauthorized-domain') {
        alert(`Gagal: Domain ini (${currentDomain}) belum didaftarkan di Firebase. Silakan tambahkan "${currentDomain}" ke daftar 'Authorized Domains' di Firebase Console > Authentication > Settings.`);
      } else {
        alert(`Gagal login (${error.code}): ${error.message}\n\nPastikan Google Auth sudah aktif di Project g7kaih-ca74b.`);
      }
    } finally {
      setLoggingIn(false);
    }
  };

  if (authLoading || schoolLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (currentView === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white p-10 rounded-3xl shadow-xl border border-red-50">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-800 mb-2">Sekolah Tidak Ditemukan</h1>
          <p className="text-slate-500 mb-6">Link akses yang Anda gunakan tidak valid atau sekolah belum terdaftar.</p>
          <a href="/" className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all inline-block">Kembali</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className={`no-print relative overflow-hidden py-10 px-4 shadow-lg ${school?.headerColor || 'bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700'}`}>
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="grid grid-cols-8 gap-4 opacity-20 transform -rotate-12 scale-150">
            {Array.from({ length: 48 }).map((_, i) => (
              <GraduationCap key={i} className="text-white w-12 h-12" />
            ))}
          </div>
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center justify-center w-16 h-16 bg-yellow-400 rounded-full shadow-2xl mb-4"
          >
            <GraduationCap className="w-8 h-8 text-blue-900" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-4xl font-bold text-white mb-2 tracking-tight text-center"
          >
            Portal Kelulusan Digital
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-sm md:text-lg text-blue-100 font-medium opacity-80 text-center"
          >
            {school?.name || 'Sekolah Terdaftar'} - Tahun Pelajaran {school?.year || '2025/2026'}
          </motion.p>
        </div>
      </header>

      <main className="flex-1 no-print py-10 px-4 relative max-w-5xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {currentView === 'search' && (
            <motion.div
              key="search-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="w-full flex flex-col items-center"
            >
              <div className="flex justify-center gap-6 mb-10">
                {['👧', '👦', '🎓', '🎉'].map((emoji, i) => (
                  <motion.span
                    key={i}
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 2, delay: i * 0.2 }}
                    className="text-4xl md:text-5xl drop-shadow-md"
                  >
                    {emoji}
                  </motion.span>
                ))}
              </div>

              <div className="w-full max-w-xl">
                <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 mb-6 mx-auto w-fit">
                  <button 
                    onClick={() => setSearchType('graduation')}
                    className={`px-6 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2 ${
                      searchType === 'graduation' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    Kelulusan
                  </button>
                  <button 
                    onClick={() => setSearchType('tka')}
                    className={`px-6 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2 ${
                      searchType === 'tka' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                    Hasil TKA
                  </button>
                </div>

                {!user && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-blue-800 leading-relaxed">
                      <p className="font-bold mb-1">Catatan untuk Admin:</p>
                      Jika tombol <b>Login Admin</b> di bawah tidak memunculkan popup, silakan buka aplikasi di <b>Halaman Baru</b> (klik ikon kotak dengan panah di pojok kanan atas preview).
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.05)] p-8 md:p-10 border border-slate-100">
                  <h2 className="text-xl font-bold text-slate-800 mb-6 text-center italic">
                    {searchType === 'graduation' ? '"Gunakan NISN Anda untuk melihat kelulusan"' : '"Gunakan NISN Anda untuk melihat hasil TKA"'}
                  </h2>
                  <div className="mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{school?.name || 'Portal Umum'}</span>
                  </div>
                  <form onSubmit={handleSearch} className="flex flex-col gap-4">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5" />
                      <input
                        type="text"
                        value={nisn}
                        onChange={(e) => setNisn(e.target.value)}
                        placeholder="Contoh: 0123456789"
                        disabled={searching}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:outline-none transition-all text-lg font-medium text-slate-700"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!nisn.trim() || searching}
                      className={`w-full py-4 text-white rounded-2xl font-bold transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 ${
                        searchType === 'graduation' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {searching ? <Loader2 className="w-6 h-6 animate-spin" /> : (searchType === 'graduation' ? 'Cek Kelulusan' : 'Cek Hasil TKA')}
                    </button>
                  </form>
                  <p className="mt-6 text-center text-xs text-slate-400">
                    Hubungi wali kelas jika terdapat kendala pencarian.
                  </p>
                </div>
              </div>

              {isAdmin && (
                <button 
                  onClick={() => setCurrentView('admin')}
                  className="mt-12 flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-full font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95"
                >
                  <Settings className="w-5 h-5" />
                  Ke Panel Administrator
                </button>
              )}
            </motion.div>
          )}

          {currentView === 'result' && (
            <motion.div
              key="result-view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto"
            >
              <button 
                onClick={resetSearch}
                className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold mb-6 transition-colors group"
              >
                <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:bg-blue-50">
                  <ArrowLeft className="w-5 h-5" />
                </div>
                <span>Kembali ke Pencarian</span>
              </button>

              {result === 'NOT_FOUND' ? (
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-red-100 p-10 text-center">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="w-12 h-12" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">Data Tidak Ditemukan</h3>
                  <p className="text-slate-500 text-lg mb-8">
                    NISN <span className="font-bold text-slate-900">"{nisn}"</span> belum terdaftar di sistem.
                  </p>
                  <button onClick={resetSearch} className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all">Coba Lagi</button>
                </div>
              ) : result && (
                <div className={`bg-white rounded-3xl shadow-2xl overflow-hidden border ${searchType === 'graduation' ? 'border-emerald-50' : 'border-indigo-50'}`}>
                  {searchType === 'graduation' ? (
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-10 text-center relative overflow-hidden">
                       <CheckCircle2 className="w-20 h-20 text-white mx-auto mb-6 relative z-10" />
                       <h2 className="text-white font-black text-3xl md:text-4xl leading-tight tracking-tight relative z-10">
                         SELAMAT!<br/>ANDA DINYATAKAN LULUS
                       </h2>
                       <GraduationCap className="absolute -bottom-10 -right-10 w-48 h-48 text-white opacity-10" />
                    </div>
                  ) : (
                    <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-10 text-center relative overflow-hidden">
                       <Search className="w-20 h-20 text-white mx-auto mb-6 relative z-10" />
                       <h2 className="text-white font-black text-3xl md:text-4xl leading-tight tracking-tight relative z-10">
                         PENGUMUMAN<br/>HASIL TES TKA
                       </h2>
                       <GraduationCap className="absolute -bottom-10 -right-10 w-48 h-48 text-white opacity-10" />
                    </div>
                  )}
                  
                  <div className="p-10 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nama Siswa</p>
                        <p className="text-xl font-bold text-slate-800">{result.nama}</p>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nomor Induk Nasional (NISN)</p>
                        <p className="text-xl font-bold text-slate-800">{result.nisn}</p>
                      </div>
                    </div>
                    
                    {searchType === 'graduation' ? (
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Kelas</p>
                          <p className="text-xl font-bold text-slate-800">{result.kelas}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                          <p className="text-2xl font-black text-emerald-600">{result.status}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-slate-900 rounded-2xl p-6 md:p-8 text-white">
                           <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest mb-6 flex items-center gap-2">
                             RINCIAN NILAI KOMPETENSI
                           </h4>
                           {result.tka ? (
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                               <div className="text-center md:text-left">
                                 <p className="text-xs text-white/40 uppercase mb-1">Matematika</p>
                                 <p className="text-3xl font-black">{result.tka.matematika}</p>
                               </div>
                               <div className="text-center md:text-left">
                                 <p className="text-xs text-white/40 uppercase mb-1">B. Indonesia</p>
                                 <p className="text-3xl font-black">{result.tka.bahasaIndonesia}</p>
                               </div>
                             </div>
                           ) : (
                             <div className="py-4 text-white/40 italic">Data nilai TKA belum tersedia.</div>
                           )}
                        </div>

                        {result.tka && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl border border-indigo-100">
                               <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Total Skor</p>
                               <p className="text-3xl font-black text-indigo-600">
                                 {Number(result.tka.total).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                               </p>
                            </div>
                            <div className="bg-gradient-to-br from-violet-50 to-white p-6 rounded-2xl border border-violet-100">
                               <p className="text-xs font-bold text-violet-400 uppercase mb-1">Peringkat</p>
                               <p className="text-3xl font-black text-violet-600">#{result.tka.peringkat || '-'}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {searchType === 'graduation' && (
                    <div className="p-8 bg-slate-50 border-t border-slate-100">
                      <button 
                        onClick={handlePrint}
                        className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-slate-900 hover:bg-black text-white rounded-2xl font-bold transition-all shadow-xl active:scale-[0.98]"
                      >
                        <Printer className="w-6 h-6" />
                        Cetak Surat Keterangan Kelulusan
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {currentView === 'admin' && isAdmin && (
            <motion.div
              key="admin-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <button 
                onClick={() => setCurrentView('search')}
                className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold mb-6 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Kembali ke Halaman Utama
              </button>
              <AdminPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Print View Contents */}
      <div className="print-only p-12 text-slate-900 bg-white">
        {typeof result === 'object' && result !== null && result !== 'NOT_FOUND' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center pb-8 border-b-4 border-double border-slate-300 mb-10">
              <h1 className="text-3xl font-black uppercase tracking-tight mb-1">SURAT KETERANGAN KELULUSAN</h1>
              <p className="text-xl font-bold text-slate-600">{school?.name} - Tahun Pelajaran {school?.year}</p>
            </div>
            
            <div className="space-y-6 text-lg">
              <div className="flex border-b border-slate-100 pb-2">
                <span className="w-48 font-semibold text-slate-500">Nama Lengkap</span>
                <span className="font-bold">: {result.nama}</span>
              </div>
              <div className="flex border-b border-slate-100 pb-2">
                <span className="w-48 font-semibold text-slate-500">NISN</span>
                <span className="font-bold">: {result.nisn}</span>
              </div>
              <div className="flex border-b border-slate-100 pb-2">
                <span className="w-48 font-semibold text-slate-500">Kelas</span>
                <span className="font-bold">: {result.kelas}</span>
              </div>

              <div className="my-16 p-10 border-8 border-emerald-500 rounded-[4rem] text-center bg-emerald-50/30">
                <p className="text-slate-500 text-sm uppercase tracking-[0.3em] font-black mb-2">HASIL AKHIR</p>
                <p className="text-6xl font-black text-emerald-600 italic tracking-tighter uppercase">DINYATAKAN LULUS</p>
              </div>
              
              <div className="mt-20 flex justify-end">
                <div className="text-center w-80">
                  <p className="mb-2">Dicetak pada: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p className="font-bold">Kepala Sekolah,</p>
                  <div className="h-24 border-b border-slate-200 mb-4 mx-10 opacity-20"></div>
                  <p className="font-bold text-lg underline underline-offset-4">( Nama Kepala Sekolah )</p>
                  <p className="text-sm font-medium text-slate-500">NIP. ...........................</p>
                </div>
              </div>
            </div>
            
            <div className="mt-24 pt-10 border-t-2 border-slate-100 text-center">
              <p className="text-xs text-slate-400 italic">
                Dicetak secara otomatis melalui portal resmi {school?.name}.
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="no-print py-10 text-center border-t border-slate-100 bg-white">
        <div className="max-w-4xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-left">
            <p className="text-slate-400 text-sm font-bold tracking-wide">&copy; {new Date().getFullYear()} {school?.name || 'Portal Kelulusan'}.</p>
            <p className="text-slate-300 text-[10px] mt-1 uppercase tracking-widest">Informasi Kelulusan Siswa Digital</p>
          </div>
          
          <div className="flex items-center gap-4">
            {!user ? (
              <button 
                onClick={handleLogin}
                disabled={loggingIn}
                className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-blue-600 transition-colors text-sm font-bold disabled:opacity-50"
              >
                {loggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {loggingIn ? 'Memproses...' : 'Login Admin'}
              </button>
            ) : (
              <div className="flex items-center gap-4 bg-slate-50 p-1 pl-4 rounded-full border border-slate-100">
                <span className="text-xs font-bold text-slate-500 truncate max-w-[180px] md:max-w-none flex items-center gap-2" title={user.email || user.displayName || ''}>
                  <span className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-emerald-500' : 'bg-red-400'}`}></span>
                  {user.email || user.displayName || 'Admin'}
                  {!isAdmin && <span className="text-[10px] text-red-500">(Bukan Admin)</span>}
                </span>
                <button 
                  onClick={logout}
                  className="p-2 bg-white text-slate-400 hover:text-red-500 transition-colors rounded-full shadow-sm"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
