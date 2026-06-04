"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, Download, RefreshCw, Save, Send, Upload, Users } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { api, apiClient } from "@/lib/api";

const defaultMarksSetup = { totalMarks: 100, passingMarks: 33 };

type WorkflowStatus = "draft" | "review" | "approved" | "published";
type ResultRow = { studentId: string; resultId?: string; rollNumber: string; studentName: string; section: string; marksObtained?: number | ""; grade?: string; remarks?: string; workflowStatus: WorkflowStatus };

type PersonalResultRow = { _id: string; examId: string; examName: string; examType?: string; subjectId: string; subjectName: string; subjectCode?: string; marksObtained?: number; totalMarks: number; percentage: number; grade?: string; gradePoint?: number; isPassed?: boolean; remarks?: string; status?: string };

type PersonalResultPayload = {
  institution?: { name?: string; eiin?: string; address?: string };
  student?: { name?: string; rollNumber?: string; className?: string; sectionName?: string; academicYear?: string };
  filters?: { exams?: Array<{ _id: string; name: string; type?: string }>; subjects?: Array<{ _id: string; name: string; code?: string }> };
  summary?: { totalSubjects: number; totalObtained: number; totalMarks: number; percentage: number; gpa: number; passed: boolean };
  results?: PersonalResultRow[];
};

function calculateGrade(marks: number | string | undefined | null, total = 100) {
  if (marks === undefined || marks === null || marks === "") return "-";
  const num = Number(marks);
  if (Number.isNaN(num)) return "-";
  const percentage = total ? (num / total) * 100 : 0;
  if (percentage >= 80) return "A+";
  if (percentage >= 70) return "A";
  if (percentage >= 60) return "A-";
  if (percentage >= 50) return "B";
  if (percentage >= 40) return "C";
  if (percentage >= 33) return "D";
  return "F";
}

function WorkflowBadge({ status }: { status?: string }) {
  const value = status || "draft";
  const variant = value === "published" ? "default" : value === "approved" ? "secondary" : value === "review" ? "outline" : "destructive";
  return <Badge variant={variant as any}>{value}</Badge>;
}

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
        {children}
      </select>
    </label>
  );
}

function MetricCard({ title, value, helper, icon: Icon }: { title: string; value: any; helper: string; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PersonalResultsView() {
  const [data, setData] = useState<PersonalResultPayload | null>(null);
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiClient.get<PersonalResultPayload>("/academic/results/me", { params: { examId: examId || undefined, subjectId: subjectId || undefined } });
      setData(payload);
    } catch (err: any) {
      setError(err?.message || "Failed to load your result");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [examId, subjectId]);

  useEffect(() => { load(); }, [load]);

  const downloadPdf = async () => {
    if (!data) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const institution = data.institution || {};
    const student = data.student || {};
    const summary = data.summary || { totalObtained: 0, totalMarks: 0, percentage: 0, gpa: 0, passed: false, totalSubjects: 0 };
    let y = 15;
    doc.setFontSize(16); doc.text(institution.name || "School Result", 105, y, { align: "center" });
    y += 7; doc.setFontSize(10); if (institution.address) doc.text(String(institution.address), 105, y, { align: "center" });
    y += 12; doc.setFontSize(13); doc.text("Student Result", 14, y);
    y += 8; doc.setFontSize(10);
    doc.text(`Name: ${student.name || "-"}`, 14, y); doc.text(`Roll: ${student.rollNumber || "-"}`, 120, y);
    y += 6; doc.text(`Class: ${student.className || "-"}`, 14, y); doc.text(`Section: ${student.sectionName || "-"}`, 120, y);
    y += 6; doc.text(`Academic Year: ${student.academicYear || "-"}`, 14, y);
    y += 10; doc.text(`Total: ${summary.totalObtained}/${summary.totalMarks}   Percentage: ${summary.percentage}%   GPA: ${summary.gpa}   Status: ${summary.passed ? "Passed" : "Failed"}`, 14, y);
    y += 10;
    doc.setFontSize(9); doc.text("Exam", 14, y); doc.text("Subject", 55, y); doc.text("Marks", 115, y); doc.text("Grade", 140, y); doc.text("Status", 165, y);
    y += 5; doc.line(14, y, 195, y); y += 6;
    (data.results || []).forEach((row) => {
      if (y > 280) { doc.addPage(); y = 15; }
      doc.text(String(row.examName || "-"), 14, y, { maxWidth: 38 });
      doc.text(String(row.subjectName || "-"), 55, y, { maxWidth: 55 });
      doc.text(`${row.marksObtained ?? "-"}/${row.totalMarks}`, 115, y);
      doc.text(String(row.grade || "-"), 140, y);
      doc.text(row.isPassed === false ? "Fail" : "Pass", 165, y);
      y += 7;
    });
    doc.save(`${student.rollNumber || "student"}-result.pdf`);
  };

  const exams = data?.filters?.exams || [];
  const subjects = data?.filters?.subjects || [];
  const rows = data?.results || [];
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader title="My Result" description="পরীক্ষার নাম ও সাবজেক্ট অনুযায়ী আপনার প্রকাশিত ফলাফল দেখুন এবং PDF ডাউনলোড করুন।" icon={ClipboardCheck} actions={[<Button key="pdf" onClick={downloadPdf} disabled={!data || rows.length === 0}><Download className="mr-2 h-4 w-4" />Download PDF</Button>, <Button key="refresh" variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>]} />
      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard title="Subjects" value={summary?.totalSubjects || 0} helper="Filtered subjects" icon={Users} />
        <MetricCard title="Total Marks" value={`${summary?.totalObtained || 0}/${summary?.totalMarks || 0}`} helper="Obtained / total" icon={ClipboardCheck} />
        <MetricCard title="Percentage" value={`${summary?.percentage || 0}%`} helper="Overall score" icon={CheckCircle2} />
        <MetricCard title="GPA" value={summary?.gpa || 0} helper={summary?.passed ? "Passed" : "Failed / no result"} icon={Save} />
      </section>
      <Card>
        <CardHeader><CardTitle>Filter Result</CardTitle><CardDescription>Exam অথবা Subject নির্বাচন করলে শুধু সেই ফলাফল দেখাবে।</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Filter label="Exam" value={examId} onChange={setExamId}><option value="">All exams</option>{exams.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}</Filter>
          <Filter label="Subject" value={subjectId} onChange={setSubjectId}><option value="">All subjects</option>{subjects.map((s) => <option key={s._id} value={s._id}>{s.name} {s.code ? `(${s.code})` : ""}</option>)}</Filter>
        </CardContent>
      </Card>
      {error && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4" />{error}</div>}
      <Card>
        <CardHeader><CardTitle>{data?.student?.name || "Student"}</CardTitle><CardDescription>Roll {data?.student?.rollNumber || "-"} · Class {data?.student?.className || "-"} · Section {data?.student?.sectionName || "-"}</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead>Marks</TableHead><TableHead>Grade</TableHead><TableHead>Status</TableHead><TableHead>Remarks</TableHead></TableRow></TableHeader>
            <TableBody>{loading ? <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow> : rows.length ? rows.map((row) => <TableRow key={row._id}><TableCell>{row.examName}</TableCell><TableCell>{row.subjectName} {row.subjectCode ? `(${row.subjectCode})` : ""}</TableCell><TableCell>{row.marksObtained ?? "-"}/{row.totalMarks}</TableCell><TableCell>{row.grade || "-"}</TableCell><TableCell><Badge variant={row.isPassed === false ? "destructive" : "default"}>{row.isPassed === false ? "Fail" : "Pass"}</Badge></TableCell><TableCell>{row.remarks || "-"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No published result found yet.</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ManagementResultsView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [marksSetup, setMarksSetup] = useState(defaultMarksSetup);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("draft");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, s, e] = await Promise.all([api.academic.classes.getAll(), api.academic.subjects.getAll(), api.academic.exams.getAll()]) as any[];
        const nextClasses = c.classes || c.classItems || [];
        const nextSubjects = s.subjects || [];
        const nextExams = e.exams || [];
        setClasses(nextClasses); setSubjects(nextSubjects); setExams(nextExams);
        const firstClass = nextClasses[0]?._id || "";
        setClassId(firstClass);
        setExamId(nextExams.find((x: any) => x.classId?._id === firstClass)?._id || nextExams[0]?._id || "");
        setSubjectId(nextSubjects.find((x: any) => x.classId?._id === firstClass)?._id || nextSubjects[0]?._id || "");
      } catch (err: any) { setError(err?.message || "Failed to load filters"); }
      finally { setLoading(false); }
    })();
  }, []);

  const availableSections = classes.find((c) => c._id === classId)?.sections?.filter((x: any) => x.isActive !== false) || [];
  const availableSubjects = useMemo(() => subjects.filter((s) => !classId || s.classId?._id === classId || s.classId === classId), [subjects, classId]);
  const availableExams = useMemo(() => exams.filter((e) => !classId || e.classId?._id === classId || e.classId === classId), [exams, classId]);
  const ready = Boolean(classId && examId && subjectId);

  const loadRows = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError("");
    try {
      const data: any = await api.academic.results.getEntry({ classId, sectionId: sectionId || undefined, examId, subjectId });
      setRows((data.rows || []).map((r: any) => ({ ...r, marksObtained: r.marksObtained ?? "" })));
      setMarksSetup(data.marksSetup || defaultMarksSetup);
      setWorkflowStatus(data.workflowStatus || "draft");
    } catch (err: any) { setError(err?.message || "Failed to load results"); }
    finally { setLoading(false); }
  }, [ready, classId, sectionId, examId, subjectId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const updateMark = (studentId: string, value: Partial<ResultRow>) => setRows((current) => current.map((row) => row.studentId === studentId ? { ...row, ...value } : row));

  const saveDraft = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const data: any = await api.academic.results.saveDraft({ classId, sectionId: sectionId || undefined, examId, subjectId, rows });
      setRows((data.rows || []).map((r: any) => ({ ...r, marksObtained: r.marksObtained ?? "" })));
      setWorkflowStatus(data.workflowStatus || "draft");
      setSuccess("Draft saved successfully.");
    } catch (err: any) { setError(err?.message || "Failed to save draft"); }
    finally { setSaving(false); }
  };
  const workflow = async (action: "review" | "assistant" | "head" | "publish") => {
    setSaving(true); setError(""); setSuccess("");
    const payload = { classId, sectionId: sectionId || undefined, examId, subjectId };
    try {
      if (action === "review") await api.academic.results.submitReview(payload);
      if (action === "assistant") await api.academic.results.assistantApprove(payload);
      if (action === "head") await api.academic.results.headApprove(payload);
      if (action === "publish") await api.academic.results.publish(payload);
      setSuccess("Workflow updated successfully.");
      await loadRows();
    } catch (err: any) { setError(err?.message || "Workflow action failed"); }
    finally { setSaving(false); }
  };

  const filled = rows.filter((r) => r.marksObtained !== "" && r.marksObtained !== undefined && r.marksObtained !== null).length;
  const pass = rows.filter((r) => typeof r.marksObtained === "number" && r.marksObtained >= marksSetup.passingMarks).length;
  const fail = rows.filter((r) => typeof r.marksObtained === "number" && r.marksObtained < marksSetup.passingMarks).length;

  return (
    <div className="space-y-5">
      <PageHeader title="Result Management" description="Enter marks, approve workflow and publish results for students." icon={ClipboardCheck} status={<WorkflowBadge status={workflowStatus} />} actions={[<Button key="refresh" variant="outline" onClick={loadRows}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>]} />
      <section className="grid gap-3 md:grid-cols-4"><MetricCard title="Students" value={rows.length} helper="Loaded rows" icon={Users} /><MetricCard title="Filled Marks" value={filled} helper={`Missing ${rows.length - filled}`} icon={Save} /><MetricCard title="Pass / Fail" value={`${pass}/${fail}`} helper={`Pass mark ${marksSetup.passingMarks}`} icon={CheckCircle2} /><MetricCard title="Total Marks" value={marksSetup.totalMarks} helper="Per subject" icon={ClipboardCheck} /></section>
      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-4"><Filter label="Class" value={classId} onChange={(v) => { setClassId(v); setSectionId(""); setExamId(exams.find((e: any) => e.classId?._id === v || e.classId === v)?._id || ""); setSubjectId(subjects.find((s: any) => s.classId?._id === v || s.classId === v)?._id || ""); }}><option value="">Select class</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Filter><Filter label="Section" value={sectionId} onChange={setSectionId}><option value="">All sections</option>{availableSections.map((s: any) => <option key={s._id} value={s._id}>{s.name}</option>)}</Filter><Filter label="Exam" value={examId} onChange={setExamId}><option value="">Select exam</option>{availableExams.map((e: any) => <option key={e._id} value={e._id}>{e.name}</option>)}</Filter><Filter label="Subject" value={subjectId} onChange={setSubjectId}><option value="">Select subject</option>{availableSubjects.map((s: any) => <option key={s._id} value={s._id}>{s.name} {s.code ? `(${s.code})` : ""}</option>)}</Filter></CardContent></Card>
      {error && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4" />{error}</div>}{success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
      <Card><CardHeader><CardTitle>Marks Entry</CardTitle><CardDescription>Save draft first, then submit/approve/publish.</CardDescription></CardHeader><CardContent><div className="mb-3 flex flex-wrap gap-2"><Button variant="outline" disabled={!ready || saving} onClick={saveDraft}><Save className="mr-2 h-4 w-4" />Save Draft</Button><Button variant="outline" disabled={!ready || saving || !rows.length} onClick={() => workflow("review")}><Send className="mr-2 h-4 w-4" />Submit Review</Button><Button variant="outline" disabled={!ready || saving} onClick={() => workflow("assistant")}>Assistant Approval</Button><Button variant="outline" disabled={!ready || saving} onClick={() => workflow("head")}>Head Approval</Button><Button disabled={!ready || saving || !rows.length} onClick={() => workflow("publish")}><Upload className="mr-2 h-4 w-4" />Publish</Button></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Roll</TableHead><TableHead>Student</TableHead><TableHead>Section</TableHead><TableHead>Marks</TableHead><TableHead>Grade</TableHead><TableHead>Remarks</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={7} className="h-24 text-center">Loading...</TableCell></TableRow> : rows.length ? rows.map((row) => <TableRow key={row.studentId}><TableCell>{row.rollNumber}</TableCell><TableCell>{row.studentName}</TableCell><TableCell>{row.section || "-"}</TableCell><TableCell><Input type="number" min={0} max={marksSetup.totalMarks} value={row.marksObtained} onChange={(e) => updateMark(row.studentId, { marksObtained: e.target.value === "" ? "" : Number(e.target.value) })} className="w-28" /></TableCell><TableCell>{row.marksObtained !== "" ? calculateGrade(row.marksObtained, marksSetup.totalMarks) : row.grade || "-"}</TableCell><TableCell><Input value={row.remarks || ""} onChange={(e) => updateMark(row.studentId, { remarks: e.target.value })} placeholder="Optional" /></TableCell><TableCell><WorkflowBadge status={row.workflowStatus || workflowStatus} /></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Select filters to load students/results.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
    </div>
  );
}

export default function ResultsPage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (user?.role === "student" || user?.role === "parent") return <PersonalResultsView />;
  return <ManagementResultsView />;
}
