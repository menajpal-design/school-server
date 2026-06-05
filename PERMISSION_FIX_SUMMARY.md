# Backend Permission Fix Summary

## Scope
This branch verifies and hardens API authorization so student/parent restrictions do not depend only on frontend button hiding.

## Shared auth/scope foundation
- `authenticate` is used by protected API routes and resolves tenant/institution context.
- `authorize(...)` is used for role-only endpoints.
- `checkPermission(...)`, `canManageAcademic()`, `canScanIDCard()`, `canGenerateIDCard()`, `canEditIDCard()`, and related guards remain the primary middleware helpers.
- Institution/tenant scope is applied using `req.user.institutionId` or tenant helpers in protected queries.

## Students API
Manual checks:
- Student/parent must receive 403 for `GET /api/students` list.
- Student/parent must receive 403 for `POST /api/students` create.
- Student can read only own profile through `GET /api/students/:id` when id maps to own user/student profile.
- Parent can read only linked child profile through `GET /api/students/:id` when id maps to linked child.
- Student/parent cannot update student records.

## Subjects API
Manual checks:
- Student/parent must receive 403 for subject create/update/delete.
- Student/parent must not use `/api/academic/subjects` as a management API.
- Teacher/head/admin management behavior remains through `canManageAcademic()`.

## Syllabus API
Manual checks:
- Student can read own class/section syllabus only.
- Parent can read linked child class syllabus only.
- Student/parent must receive 403 for create/edit/delete/publish.
- Teacher/head/admin management behavior remains unchanged.

## Class routine API
Manual checks:
- Student/parent must use scoped routine read endpoints only.
- Student can read own class/section public approved routine only.
- Parent can read linked child public approved routine only.
- Student/parent must receive 403 for create/edit/delete/publish/approve.

## Exams and exam routine APIs
Manual checks:
- Student can read published own-class exams/routines only.
- Parent can read published linked-child class exams/routines only.
- Student/parent must receive 403 for create/update/delete/public-routine/publish/approve style endpoints.

## Results APIs
Manual checks:
- Student can read own result only through scoped result endpoint.
- Parent can read linked child result only.
- Student/parent must receive 403 for result create/edit/save draft/submit review/approve/publish endpoints.

## Attendance API
Manual checks:
- Student/parent can read own/child attendance only through scoped attendance endpoints.
- Student/parent must receive 403 for `/api/attendance/mark` and scanner/marking actions.
- Class teacher can mark assigned class only.
- Approved leave attendance uses `status: "leave"` and must not count as present.

## Leave applications API
Manual checks:
- Student can create/view own leave only.
- Parent can create/view linked child leave only.
- Student/parent must receive 403 for review endpoints.
- Class teacher can approve/reject assigned class only.
- Head/assistant head can review institution leave.
- Approved leave creates attendance records for each date with `status: "leave"`.

## Homework API
Manual checks:
- Student can read own class/section published homework only.
- Parent can read linked child class homework only.
- Student/parent must receive 403 for create/delete/manage homework.
- Teacher/class teacher can manage assigned class homework.
- Head/admin broader management remains according to role policy.

## Library API
Manual checks:
- Student/parent can read available books only.
- Student can read own issued/requested loans only.
- Parent can read linked child loans only.
- Student/parent/teacher must receive 403 for create/edit/delete books and issue/return books.
- Head/admin/librarian/staff can manage library according to role policy.

## SMS Monitoring API
Manual checks:
- Student/parent must receive 403 for all SMS monitoring/settings/diagnostic/test endpoints.
- Assistant head/finance officer/staff are also blocked from SMS monitoring per current requirement.
- Only head/admin/super_admin can access SMS monitoring.

## ID Card API
Manual checks:
- Student can access own `/api/id-cards/me/card` only.
- Parent is blocked from `/me/card` and must use scoped child-card endpoint.
- Parent child-card endpoint must allow linked child only and reject unlinked student ids.
- Student profile existing but no generated card returns a clear generated=false style response instead of false not found.

## Build commands
```bash
cd school-server
npm install
npm run lint
npm run build
```
