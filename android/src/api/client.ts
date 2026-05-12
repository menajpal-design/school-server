import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const manifestApiUrl = (Constants.expoConfig?.extra?.apiUrl as string | undefined) || "http://10.0.2.2:5000/api";
export const API_URL = process.env.EXPO_PUBLIC_API_URL || manifestApiUrl;

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
};

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await AsyncStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!options.formData) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.formData || (options.body ? JSON.stringify(options.body) : undefined)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.message || `Request failed with ${response.status}`);
  }
  return data;
}

export const api = {
  auth: {
    login: (body: { email: string; password: string }) => request("/auth/login", { method: "POST", body }),
    register: (body: any) => request("/auth/register", { method: "POST", body }),
    profile: () => request("/auth/profile"),
    changePassword: (body: any) => request("/auth/change-password", { method: "POST", body })
  },
  dashboard: {
    stats: () => request("/dashboard/stats"),
    attendanceOverview: () => request("/dashboard/attendance-overview"),
    feeOverview: () => request("/dashboard/fee-overview"),
    recentNotices: () => request("/dashboard/recent-notices"),
    summary: () => request("/dashboard/summary"),
    charts: () => request("/dashboard/charts"),
    composition: () => request("/dashboard/composition")
  },
  academic: {
    overview: () => request("/academic"),
    classes: () => request("/academic/classes"),
    subjects: () => request("/academic/subjects"),
    exams: () => request("/academic/exams"),
    results: () => request("/academic/results"),
    reportCard: async () => {
      try {
        return await request("/academic/report-card");
      } catch {
        const data = await request<{ students?: Array<{ _id: string }> }>("/students");
        const studentId = data.students?.[0]?._id;
        return studentId ? request(`/academic/report-card?studentId=${studentId}`) : { reportCard: null };
      }
    }
  },
  attendance: {
    all: () => request("/attendance"),
    mark: (body: any) => request("/attendance/mark", { method: "POST", body }),
    reports: () => request("/attendance/reports"),
    mine: () => request("/attendance/me"),
    scanIdCard: (body: any) => request("/attendance/scan-id-card", { method: "POST", body })
  },
  finance: {
    overview: () => request("/finance"),
    collections: () => request("/finance/collections"),
    fees: () => request("/finance/fees"),
    myFees: () => request("/finance/my-fees"),
    reports: () => request("/finance/reports"),
    salary: () => request("/finance/salary")
  },
  idCards: {
    all: () => request("/id-cards"),
    mine: () => request("/id-cards/me/card"),
    generate: (body: any) => request("/id-cards/generate", { method: "POST", body }),
    bulk: (body: any) => request("/id-cards/bulk", { method: "POST", body }),
    renewal: () => request("/id-cards"),
    reports: () => request("/id-cards/reports/stats"),
    templates: async () => ({ templates: [{ name: "Standard", type: "student" }, { name: "Staff", type: "staff" }] })
  },
  institution: {
    overview: () => request("/institution/profile"),
    admission: (body: any) => request("/students", { method: "POST", body }),
    profile: () => request("/institution/profile"),
    teachers: () => request("/teachers"),
    staff: () => request("/staff"),
    backup: () => request("/backup")
  },
  documents: {
    overview: () => request("/documents"),
    upload: (formData: FormData) => request("/documents/upload", { method: "POST", formData }),
    manage: () => request("/documents/manage")
  },
  notices: {
    all: () => request("/notices"),
    create: (formData: FormData) => request("/notices", { method: "POST", formData })
  },
  committee: { all: () => request("/committee") },
  parent: { portal: () => request("/parent/portal") },
  users: {
    overview: () => request("/users"),
    all: () => request("/users/all"),
    permissions: () => request("/users/permissions"),
    updatePermissions: (matrix: any) => request("/users/permissions", { method: "PUT", body: { matrix } })
  },
  settings: {
    local: async () => ({ settings: ["General", "Notification", "ID Card", "Security", "Backup"] })
  }
};
