# Security Specification - SDN 3 Ciomas Graduation

## Data Invariants
- Students use their NIS as the document ID.
- Public access is allowed for single document retrieval (GET) to check individual results.
- Administrative access (CRUD, LIST) is restricted to users in the `admins` collection.
- Status must be either 'LULUS' or 'TIDAK LULUS'.

## Dirty Dozen Payloads (Rejection Targets)
1. **Unauth Create**: `{ nis: "123", nama: "Hacker" }` -> DENIED (Auth required)
2. **Auth Non-Admin Create**: Logged in as normal user -> DENIED (Admin required)
3. **Invalid NIS**: `{ nis: "!!!", ... }` -> DENIED (Regex/Format check)
4. **Missing Fields**: `{ nis: "123", nama: "Only Name" }` -> DENIED (Schema check)
5. **Invalid Status**: `{ ..., status: "MAYBE" }` -> DENIED (Enum check)
6. **Poisoned ID**: Document ID = "a".repeat(2000) -> DENIED (Size check)
7. **Blanket Read**: `db.collection('students').get()` by non-admin -> DENIED (List restricted)
8. **Admin Injection**: `{ ..., nama: "A".repeat(2000) }` -> DENIED (Size check)
9. **Spoofing Author**: Setting non-existent IDs -> DENIED (Validation check)
10. **State Skipping**: Trying to bypass intermediate steps -> DENIED (Terminal state lock)
11. **Self-Admin**: `db.collection('admins').doc('my-uid').set({ email: 'me@me.com' })` -> DENIED (Admin bootstrap required)
12. **Future Timestamp**: `{ ..., updatedAt: 2099-01-01 }` -> DENIED (`request.time` check)

## Implementation Strategy
- Use NIS as document ID for the `students` collection.
- `allow get: if true;` for `students/{nis}` to allow public check.
- `allow list: if isAdmin();` for `students` to allow admin management.
- `allow delete: if isAdmin();` for students.
- `allow create, update: if isAdmin() && isValidStudent(incoming());`
