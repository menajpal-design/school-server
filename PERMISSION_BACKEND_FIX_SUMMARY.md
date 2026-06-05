# Backend Permission Fix Summary

Static code review and patches only. Tests were not run.

## Changed files

- src/app.ts
- src/services/permissionPolicy.ts
- src/routes/resultsSafe.ts
- src/routes/classesSafe.ts
- src/routes/subjectsSafe.ts
- src/routes/examsSafe.ts
- src/routes/idCard.ts
- src/models/LeaveApplication.ts
- src/routes/leaves.ts

## Critical backend fixes completed

### Route mounting
- Added a scoped results router before the legacy academic router.
- This prevents older broad academic result handlers from catching direct result API requests first.

### Central policy
- Added a shared permission policy service.
- Added action guards for result, exam, class, subject, leave, library, ID card, settings, SMS, and attendance actions.
- Added actor scope resolver for user, student, child students, teacher, staff, assigned classes, assigned sections, and assigned subjects.

### Results
- Added scoped result routes.
- Student and parent are blocked from result entry routes and must use the personal result route.
- Teacher and class teacher result create, update, draft, and review submit are scoped to assigned class and subject.
- Result approve and publish actions now use separate action guards.
- Publish is restricted to head, admin, and super admin policy.

### Exams
- Exam reads are scoped.
- Student and parent only see published exams for own or linked child class.
- Teacher and class teacher only see assigned class exams.
- Exam create, update, delete, and public routine publish no longer use broad academic access in the safe route.

### Subjects
- Subject reads are scoped.
- Student and parent do not receive all institution subjects.
- Teacher receives assigned subjects or assigned class subjects only.
- Subject create, update, and delete use central action guards.

### Classes
- Class reads are scoped.
- Student receives own class only.
- Parent receives linked child classes only.
- Teacher and class teacher receive assigned classes only.
- Head, assistant head, admin, and super admin receive institution classes.

### ID cards
- ID card generate, bulk generate, search owners, manage, report, email, and renew now use central policy guards.
- Staff, finance officer, and class teacher are blocked from direct generate and manage APIs unless policy is intentionally changed.

### Site settings
- Existing site settings routes already require authentication.
- Existing access is limited to admin, super admin, and head.
- Stored MongoDB values are masked in read responses.

### Leave
- Leave model now supports student, parent, teacher, and staff style leave records.
- Teacher, class teacher, subject teacher, staff, finance officer, and librarian can submit own leave.
- Users cannot approve their own leave.
- Class teacher can only review student leave for assigned classes.
- Head, assistant head, admin, and super admin can review institution scoped leave.
- Approved student leave creates student attendance records with leave status.
- Approved employee leave creates teacher or staff attendance records with leave status.

## Role enum status

- finance_officer already exists in the current backend User role enum.
- librarian still needs to be added to the User role enum. The write attempt for src/models/User.ts was blocked in this session, so it remains a required migration.

## Remaining assumptions and follow-up

- Some legacy academic handlers still exist in src/routes/academic.ts, but safe mounted routes now handle classes, subjects, exams, and results first.
- Attendance scan endpoints still reference the old canScanIDCard middleware. The safe ID card route was tightened, but attendance scan middleware should be narrowed next to class teacher assigned class or school leader.
- Institution student list should be reviewed next for teacher and class teacher assigned scope.
- Library route should be reviewed next for librarian-only management and read-only issued-book scope.
- No automated tests were run by request.
