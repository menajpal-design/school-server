export type Role =
  | "head"
  | "assistant_head"
  | "class_teacher"
  | "subject_teacher"
  | "finance_officer"
  | "staff"
  | "student"
  | "parent"
  | "committee_member";

export type User = {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatar?: string;
  institutionId?: string;
  institution?: Record<string, unknown>;
  permissions?: string[];
};

export type ApiResponse<T = any> = T & {
  message?: string;
  user?: User;
  token?: string;
};

export type ScreenKey =
  | "Dashboard"
  | "Academic"
  | "Classes"
  | "Subjects"
  | "Exams"
  | "Results"
  | "ReportCard"
  | "Attendance"
  | "MarkAttendance"
  | "MyAttendance"
  | "AttendanceReports"
  | "Finance"
  | "Collections"
  | "Fees"
  | "MyFees"
  | "FinanceReports"
  | "Salary"
  | "IDCards"
  | "MyCard"
  | "GenerateCard"
  | "BulkGenerate"
  | "Templates"
  | "Renewal"
  | "IDCardReports"
  | "Institution"
  | "Admission"
  | "InstitutionProfile"
  | "Teachers"
  | "Staff"
  | "Backup"
  | "Documents"
  | "UploadDocuments"
  | "ManageDocuments"
  | "Notices"
  | "Committee"
  | "ParentPortal"
  | "MyProfile"
  | "ChangePassword"
  | "Settings"
  | "UsersRoles"
  | "AllUsers"
  | "Permissions";
