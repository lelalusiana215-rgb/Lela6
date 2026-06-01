/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface School {
  id: string;
  name: string;
  year: string;
  headerColor?: string;
}

/** Representasi data siswa untuk pengumuman kelulusan. */
export interface Student {
  nisn: string;
  nama: string;
  kelas: string;
  status: 'LULUS' | 'TIDAK LULUS';
  schoolId: string;
  updatedAt?: any; // Firestore Timestamp
  tka?: {
    matematika: number;
    bahasaIndonesia: number;
    total: number;
    peringkat?: number;
  };
}

export interface AdminUser {
  email: string;
  schoolIds: string[];
}

export const MOCK_STUDENTS: any[] = [
  { nisn: "230145", nama: "Ahmad Fauzi", kelas: "VI A", status: "LULUS", schoolId: "mock" },
  { nisn: "230146", nama: "Siti Aisyah", kelas: "VI A", status: "LULUS", schoolId: "mock" },
  { nisn: "230147", nama: "Budi Santoso", kelas: "VI B", status: "LULUS", schoolId: "mock" }
];
