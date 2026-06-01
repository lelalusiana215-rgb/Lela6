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
        const isSuper = userEmail === 'lelalusiana215@gmail.com';
        setIsSuperAdmin(isSuper);
        
        if (user && userEmail) {
          try {
            // Check for admin permissions based on email (lowercase)
            const adminRef = doc(db, 'admins', userEmail.trim());
            const adminDoc = await getDoc(adminRef);
            const exists = adminDoc.exists();
            const adminData = adminDoc.data();
            const schools = adminData?.schoolIds || [];
            
            console.log(`Admin check for ${userEmail}: exists=${exists}, schools=${schools.length}`);
            
            setAdminSchools(schools);
            // Consider admin if they exist in collection OR are super admin
            setIsAdmin(isSuper || exists);
          } catch (error) {
            console.error("Error fetching admin status:", error);
            setIsAdmin(isSuper);
            setAdminSchools([]);
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
