import { api } from "../api/client";
import { Role, ScreenKey } from "../types";

export type ScreenConfig = {
  key: ScreenKey;
  title: string;
  group: string;
  subtitle: string;
  allowed?: Role[];
  loader?: () => Promise<any>;
  chart?: "dashboard" | "attendance" | "finance" | "composition";
  editable?: "notice" | "document" | "password" | "attendance-scan" | "permissions" | "settings" | "profile";
};

const management: Role[] = ["head", "assistant_head", "staff"];
const academic: Role[] = ["head", "assistant_head", "class_teacher", "subject_teacher"];
const finance: Role[] = ["head", "finance_officer"];
const idCards: Role[] = ["head", "assistant_head", "class_teacher", "staff", "student", "parent"];
const users: Role[] = ["head"];

export const screens: ScreenConfig[] = [
  { key: "Dashboard", title: "Dashboard", group: "Main", subtitle: "Stat cards, charts and recent activity.", loader: api.dashboard.summary, chart: "dashboard" },
  { key: "Academic", title: "Academic", group: "Academic", subtitle: "Academic overview.", loader: api.academic.overview, allowed: academic },
  { key: "Classes", title: "Classes", group: "Academic", subtitle: "Class and section management.", loader: api.academic.classes, allowed: academic },
  { key: "Subjects", title: "Subjects", group: "Academic", subtitle: "Subject catalog and assignments.", loader: api.academic.subjects, allowed: academic },
  { key: "Exams", title: "Exams", group: "Academic", subtitle: "Exam schedules and configuration.", loader: api.academic.exams, allowed: academic },
  { key: "Results", title: "Results", group: "Academic", subtitle: "Result entry and workflow.", loader: api.academic.results, allowed: academic },
  { key: "ReportCard", title: "Report Card", group: "Academic", subtitle: "Published student report card.", loader: api.academic.reportCard },
  { key: "Attendance", title: "Attendance", group: "Attendance", subtitle: "Attendance overview.", loader: api.attendance.all, chart: "attendance", allowed: academic },
  { key: "MarkAttendance", title: "Mark Attendance", group: "Attendance", subtitle: "Scan ID card or mark attendance.", editable: "attendance-scan", allowed: academic },
  { key: "MyAttendance", title: "My Attendance", group: "Attendance", subtitle: "Your personal attendance.", loader: api.attendance.mine },
  { key: "AttendanceReports", title: "Attendance Reports", group: "Attendance", subtitle: "Date, class and section reports.", loader: api.attendance.reports, chart: "attendance", allowed: academic },
  { key: "Finance", title: "Finance", group: "Finance", subtitle: "Collections, dues and salary overview.", loader: api.finance.overview, chart: "finance", allowed: finance },
  { key: "Collections", title: "Collections", group: "Finance", subtitle: "Payment collection history.", loader: api.finance.collections, allowed: finance },
  { key: "Fees", title: "Fees", group: "Finance", subtitle: "Fee setup and due records.", loader: api.finance.fees, allowed: finance },
  { key: "MyFees", title: "My Fees", group: "Finance", subtitle: "Student or parent fee view.", loader: api.finance.myFees },
  { key: "FinanceReports", title: "Reports", group: "Finance", subtitle: "Finance reports and trends.", loader: api.finance.reports, chart: "finance", allowed: finance },
  { key: "Salary", title: "Salary", group: "Finance", subtitle: "Teacher and staff salary records.", loader: api.finance.salary, allowed: finance },
  { key: "IDCards", title: "ID Cards", group: "ID Cards", subtitle: "ID card records.", loader: api.idCards.all, allowed: idCards },
  { key: "MyCard", title: "My Card", group: "ID Cards", subtitle: "Your ID card preview.", loader: api.idCards.mine },
  { key: "GenerateCard", title: "Generate", group: "ID Cards", subtitle: "Generate one ID card.", loader: api.idCards.all, allowed: idCards },
  { key: "BulkGenerate", title: "Bulk Generate", group: "ID Cards", subtitle: "Bulk card generation queue.", loader: api.idCards.all, allowed: idCards },
  { key: "Templates", title: "Templates", group: "ID Cards", subtitle: "Card design templates.", loader: api.idCards.templates, allowed: idCards },
  { key: "Renewal", title: "Renewal", group: "ID Cards", subtitle: "Renewal requests and approvals.", loader: api.idCards.renewal, allowed: idCards },
  { key: "IDCardReports", title: "ID Card Reports", group: "ID Cards", subtitle: "Card issuance and download stats.", loader: api.idCards.reports, chart: "composition", allowed: idCards },
  { key: "Institution", title: "Institution", group: "Institution", subtitle: "Institution overview.", loader: api.institution.overview, allowed: management },
  { key: "Admission", title: "Admission", group: "Institution", subtitle: "Student admission workflow.", loader: api.academic.classes, allowed: management },
  { key: "InstitutionProfile", title: "Profile", group: "Institution", subtitle: "Institution profile.", loader: api.institution.profile, allowed: management },
  { key: "Teachers", title: "Teachers", group: "Institution", subtitle: "Teacher list.", loader: api.institution.teachers, allowed: management },
  { key: "Staff", title: "Staff", group: "Institution", subtitle: "Staff list.", loader: api.institution.staff, allowed: management },
  { key: "Backup", title: "Backup", group: "Institution", subtitle: "Backup configuration.", loader: api.institution.backup, allowed: management },
  { key: "Documents", title: "Documents", group: "Documents", subtitle: "Document overview.", loader: api.documents.overview },
  { key: "UploadDocuments", title: "Upload Documents", group: "Documents", subtitle: "Upload files with owner metadata.", editable: "document" },
  { key: "ManageDocuments", title: "Manage Documents", group: "Documents", subtitle: "Search and manage uploaded files.", loader: api.documents.manage },
  { key: "Notices", title: "Notices", group: "Communication", subtitle: "Notice board and scheduled posts.", loader: api.notices.all, editable: "notice" },
  { key: "Committee", title: "Committee", group: "Communication", subtitle: "Committee, meetings and attendance.", loader: api.committee.all },
  { key: "ParentPortal", title: "Parent Portal", group: "Portal", subtitle: "Children, attendance, fees and notices.", loader: api.parent.portal, allowed: ["parent", "head"] },
  { key: "MyProfile", title: "Profile", group: "Account", subtitle: "Personal profile and institution info.", loader: api.auth.profile, editable: "profile" },
  { key: "ChangePassword", title: "Change Password", group: "Account", subtitle: "Update account password.", editable: "password" },
  { key: "Settings", title: "Settings", group: "Account", subtitle: "General, notification, ID card, security and backup settings.", editable: "settings" },
  { key: "UsersRoles", title: "Users & Roles", group: "Users", subtitle: "Users overview and distribution.", loader: api.users.overview, allowed: users },
  { key: "AllUsers", title: "All Users", group: "Users", subtitle: "Search users, statuses and role assignment.", loader: api.users.all, allowed: users },
  { key: "Permissions", title: "Permissions", group: "Users", subtitle: "Role permission matrix.", loader: api.users.permissions, editable: "permissions", allowed: users }
];

export function canAccess(config: ScreenConfig, role?: Role) {
  return !config.allowed || (!!role && config.allowed.includes(role));
}
