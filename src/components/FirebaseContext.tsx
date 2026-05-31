/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase.ts';

interface FirebaseContextType {
  user: User | null;
  isAdmin: boolean;
  adminSchools: string[]; // IDs of schools this admin can manage
  isSuperAdmin: boolean;
  loading: boolean;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  isAdmin: false,
  adminSchools: [],
  isSuperAdmin: false,
  loading: true
});

export const useFirebase = () => useContext(FirebaseContext);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminSchools, setAdminSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userEmail = user.email?.toLowerCase() || '';
        const isSuper = userEmail.trim() === 'lelalusiana215@gmail.com';
        setIsSuperAdmin(isSuper);
        
        console.log(`[FirebaseContext] User: ${user.email}, UID: ${user.uid}, isSuper: ${isSuper}`);
        
        if (user && userEmail) {
          try {
            // Check for admin permissions based on email (lowercase)
            const emailKey = userEmail.toLowerCase().trim();
            const adminRef = doc(db, 'admins', emailKey);
            console.log(`[FirebaseContext] Admin check: attempting fetch for ${emailKey}`);
            
            const adminDoc = await getDoc(adminRef);
            const exists = adminDoc.exists();
            
            if (exists) {
              const adminData = adminDoc.data();
              const schools = adminData?.schoolIds || [];
              console.log(`[FirebaseContext] Admin doc found for ${emailKey}, schools:`, schools);
              setAdminSchools(schools);
              setIsAdmin(true);
            } else {
              console.log(`[FirebaseContext] No admin doc found for ${emailKey}. isSuper=${isSuper}`);
              setAdminSchools([]);
              setIsAdmin(isSuper);
            }
          } catch (error: any) {
            console.error("[FirebaseContext] Error checking admin status:", error);
            console.log("[FirebaseContext] Error details:", {
              code: error.code,
              message: error.message,
              email: userEmail
            });
            
            // Critical fallback: If we are the known super admin email, allow access even if doc fetch fails
            if (isSuper) {
              console.log("[FirebaseContext] Permission denied or fetch failed, but Super Admin email matched. Allowing access.");
              setIsAdmin(true);
              setAdminSchools([]);
            } else {
              setIsAdmin(false);
              setAdminSchools([]);
            }
          }
        } else {
          setAdminSchools([]);
          setIsAdmin(isSuper);
        }
      } else {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setAdminSchools([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <FirebaseContext.Provider value={{ user, isAdmin, isSuperAdmin, adminSchools, loading }}>
      {!loading && children}
    </FirebaseContext.Provider>
  );
}
