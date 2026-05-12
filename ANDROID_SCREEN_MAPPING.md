# Android Screen Mapping

This file maps the Next.js web client routes in `client/app/` to the native Android implementation plan in `android/app/src/main/java/com/hridoy/easystudy/`.

## Status Legend
- `Done` - Native screen already exists.
- `Partial` - Native container exists, but the feature is not fully implemented yet.
- `Planned` - No native screen exists yet.

## Current Native Screens
- `LoginActivity` - app entry/login screen
- `MainActivity` - authenticated menu hub
- `DashboardActivity` - dashboard stats screen
- `ProfileActivity` - profile details screen

## Mapping

| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/` | Root landing page | `LoginActivity` or auth redirect | Planned | Web client likely redirects based on auth state. |
| `/login` | Login | `LoginActivity` | Done | Already implemented. |
| `/register` | Register | `RegisterActivity` / `RegisterFragment` | Planned | Add if mobile registration is required. |
| `/dashboard` | Dashboard | `DashboardActivity` | Done | Current native dashboard stats screen. |
| `/profile` | Profile | `ProfileActivity` | Done | Shows user profile data. |
| `/profile/change-password` | Change password | `ChangePasswordActivity` / `ChangePasswordFragment` | Planned | Should be part of auth/profile flow. |
| `/settings` | Settings | `SettingsActivity` / `SettingsFragment` | Planned | App preferences, logout, sync options. |

### Academic
| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/academic` | Academic overview | `AcademicActivity` / `AcademicFragment` | Planned | Entry screen for academic module. |
| `/academic/classes` | Classes | `ClassesFragment` | Planned | List and manage classes. |
| `/academic/subjects` | Subjects | `SubjectsFragment` | Planned | List and manage subjects. |
| `/academic/exams` | Exams | `ExamsFragment` | Planned | Exam schedules and details. |
| `/academic/results` | Results | `ResultsFragment` | Planned | Student results and grading. |
| `/academic/report-card` | Report card | `ReportCardFragment` | Planned | Printable report card view. |

### Attendance
| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/attendance` | Attendance overview | `AttendanceActivity` / `AttendanceFragment` | Planned | Module landing screen. |
| `/attendance/mark` | Mark attendance | `MarkAttendanceFragment` | Planned | Form-driven attendance marking. |
| `/attendance/reports` | Attendance reports | `AttendanceReportsFragment` | Planned | Filters and summaries. |
| `/attendance/my-attendance` | My attendance | `MyAttendanceFragment` | Planned | Student/teacher self-view. |

### Finance
| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/finance` | Finance overview | `FinanceActivity` / `FinanceFragment` | Planned | Module landing screen. |
| `/finance/fees` | Fees | `FeesFragment` | Planned | Fee list and due status. |
| `/finance/collections` | Collections | `CollectionsFragment` | Planned | Payment/collection tracking. |
| `/finance/salary` | Salary | `SalaryFragment` | Planned | Staff salary management. |
| `/finance/reports` | Finance reports | `FinanceReportsFragment` | Planned | Financial summaries. |
| `/finance/my-fees` | My fees | `MyFeesFragment` | Planned | User-specific fee view. |

### ID Cards
| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/id-cards` | ID cards overview | `IdCardsActivity` / `IdCardsFragment` | Planned | Module landing screen. |
| `/id-cards/my-card` | My card | `MyIdCardFragment` | Planned | Personal ID card display. |
| `/id-cards/generate` | Generate card | `GenerateIdCardFragment` | Planned | QR + PDF generation flow. |
| `/id-cards/bulk-generate` | Bulk generate | `BulkGenerateIdCardsFragment` | Planned | Batch generation. |
| `/id-cards/templates` | Templates | `IdCardTemplatesFragment` | Planned | Template selection and preview. |
| `/id-cards/reports` | Reports | `IdCardReportsFragment` | Planned | Issued/renewed card reports. |
| `/id-cards/renewal` | Renewal | `IdCardRenewalFragment` | Planned | Renewal workflow. |

### Documents
| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/documents` | Documents overview | `DocumentsActivity` / `DocumentsFragment` | Planned | Module landing screen. |
| `/documents/upload` | Upload document | `UploadDocumentFragment` | Planned | Needs file picker and multipart upload. |
| `/documents/manage` | Manage documents | `ManageDocumentsFragment` | Planned | List, delete, and review uploads. |

### Notices / Committee / Parent Portal
| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/notices` | Notices | `NoticesActivity` / `NoticesFragment` | Planned | Notice list and detail view. |
| `/committee` | Committee | `CommitteeActivity` / `CommitteeFragment` | Planned | Committee members and details. |
| `/parent-portal` | Parent portal | `ParentPortalActivity` / `ParentPortalFragment` | Planned | Parent-specific overview. |

### Users & Roles
| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/users-roles` | Users & roles overview | `UsersRolesActivity` / `UsersRolesFragment` | Planned | Module landing screen. |
| `/users-roles/all` | All users | `AllUsersFragment` | Planned | Unified user listing. |
| `/users-roles/permissions` | Permissions | `PermissionsFragment` | Planned | Role permissions matrix. |

### Institution
| Web route | Web screen | Native Android target | Status | Notes |
|---|---|---|---|---|
| `/institution` | Institution overview | `InstitutionActivity` / `InstitutionFragment` | Planned | Module landing screen. |
| `/institution/profile` | Institution profile | `InstitutionProfileFragment` | Planned | School profile and metadata. |
| `/institution/teachers` | Teachers | `InstitutionTeachersFragment` | Planned | Teacher listing. |
| `/institution/staff` | Staff | `InstitutionStaffFragment` | Planned | Staff listing. |
| `/institution/admission` | Admission | `AdmissionFragment` | Planned | Admission workflow. |
| `/institution/backup` | Backup | `BackupFragment` | Planned | Backup/export utilities. |

## Implementation Order Recommendation
1. Finish auth flow: login, change password, profile, logout.
2. Build the main module containers: dashboard, academic, attendance, finance.
3. Add ID card generation with QR and PDF output.
4. Add documents upload/manage with file picker support.
5. Add notices, committee, parent portal, users & roles, and institution modules.

## Notes
- The current native codebase already has `LoginActivity`, `MainActivity`, `DashboardActivity`, and `ProfileActivity`.
- Most other routes are still planned and should be added as Fragment-based screens to keep navigation manageable.
- If you want, this mapping can be split into a navigation graph or a per-module implementation checklist next.
