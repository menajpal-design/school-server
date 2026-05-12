import { CameraView, useCameraPermissions } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, Switch, Text, View } from "react-native";
import { BarChart, LineChart, PieChart } from "react-native-chart-kit";

import { api } from "../api/client";
import { Badge, Button, Card, DataList, Field, LoadingState, Screen, StatCard, styles } from "../components/ui";
import { ScreenConfig } from "../navigation/screenConfig";
import { theme } from "../theme";
import { listItems, summarize } from "../utils/format";

const chartConfig = {
  backgroundGradientFrom: theme.colors.surface,
  backgroundGradientTo: theme.colors.surface,
  color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
  labelColor: () => theme.colors.muted,
  decimalPlaces: 0
};

export function ResourceScreen({ config }: { config: ScreenConfig }) {
  if (config.editable === "password") return <ChangePasswordScreen config={config} />;
  if (config.editable === "document") return <DocumentUploadScreen config={config} />;
  if (config.editable === "notice") return <NoticeBoardScreen config={config} />;
  if (config.editable === "attendance-scan") return <AttendanceScannerScreen config={config} />;
  if (config.editable === "permissions") return <PermissionsScreen config={config} />;
  if (config.editable === "settings") return <SettingsScreen config={config} />;
  return <ApiScreen config={config} />;
}

function ApiScreen({ config }: { config: ScreenConfig }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!config.loader) return;
    setLoading(true);
    setError("");
    try {
      setData(await config.loader());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [config.key]);

  const items = useMemo(() => listItems(data, config.title), [data, config.title]);

  return (
    <Screen title={config.title} subtitle={config.subtitle} action={<Button label="Refresh" variant="outline" onPress={load} />}>
      {loading ? <LoadingState /> : error ? <Card><Text style={{ color: theme.colors.rose }}>{error}</Text></Card> : null}
      {data && config.chart ? <Charts kind={config.chart} data={data} /> : null}
      {data?.user ? <ProfileSummary user={data.user} /> : null}
      {data && <DataList items={items} />}
    </Screen>
  );
}

function Charts({ kind, data }: { kind: string; data: any }) {
  const width = Dimensions.get("window").width - 64;
  const numbers = [
    Number(data.totalStudents || data.stats?.totalStudents || data.summary?.totalStudents || 12),
    Number(data.totalTeachers || data.stats?.totalTeachers || data.summary?.totalTeachers || 5),
    Number(data.totalStaff || data.stats?.totalStaff || data.summary?.totalStaff || 3)
  ];
  if (kind === "composition") {
    return (
      <Card>
        <PieChart
          data={[
            { name: "Students", population: numbers[0], color: theme.colors.blue, legendFontColor: theme.colors.text, legendFontSize: 12 },
            { name: "Teachers", population: numbers[1], color: theme.colors.emerald, legendFontColor: theme.colors.text, legendFontSize: 12 },
            { name: "Staff", population: numbers[2], color: theme.colors.amber, legendFontColor: theme.colors.text, legendFontSize: 12 }
          ]}
          width={width}
          height={180}
          chartConfig={chartConfig}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="0"
        />
      </Card>
    );
  }
  if (kind === "finance") {
    return (
      <Card>
        <LineChart data={{ labels: ["Jan", "Feb", "Mar", "Apr"], datasets: [{ data: [12, 18, 14, 24] }] }} width={width} height={190} chartConfig={chartConfig} bezier />
      </Card>
    );
  }
  return (
    <Card>
      <BarChart data={{ labels: ["Present", "Absent", "Late"], datasets: [{ data: [numbers[0], numbers[1], numbers[2]] }] }} width={width} height={190} chartConfig={chartConfig} yAxisLabel="" yAxisSuffix="" />
    </Card>
  );
}

function ProfileSummary({ user }: { user: any }) {
  return (
    <Card>
      <Text style={styles.itemTitle}>{user.name}</Text>
      <Text style={styles.itemSubtitle}>{user.email}</Text>
      <Badge label={String(user.role || "user").replace(/_/g, " ")} />
    </Card>
  );
}

function ChangePasswordScreen({ config }: { config: ScreenConfig }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (form.newPassword.length < 8) return Alert.alert("Validation", "New password must be at least 8 characters.");
    if (form.newPassword !== form.confirmPassword) return Alert.alert("Validation", "Passwords do not match.");
    try {
      setBusy(true);
      await api.auth.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      Alert.alert("Success", "Password changed successfully.");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={config.title} subtitle={config.subtitle}>
      <Card style={{ gap: 14 }}>
        <Field label="Current password" value={form.currentPassword} onChangeText={(currentPassword) => setForm({ ...form, currentPassword })} secureTextEntry />
        <Field label="New password" value={form.newPassword} onChangeText={(newPassword) => setForm({ ...form, newPassword })} secureTextEntry />
        <Field label="Confirm password" value={form.confirmPassword} onChangeText={(confirmPassword) => setForm({ ...form, confirmPassword })} secureTextEntry />
        <Button label={busy ? "Updating..." : "Change Password"} onPress={submit} disabled={busy} />
      </Card>
    </Screen>
  );
}

function DocumentUploadScreen({ config }: { config: ScreenConfig }) {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [ownerType, setOwnerType] = useState("institution");
  const [documentType, setDocumentType] = useState("other");
  const [busy, setBusy] = useState(false);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (!result.canceled) setFile(result.assets[0]);
  };

  const upload = async () => {
    if (!file) return Alert.alert("File required", "Select a document first.");
    const form = new FormData();
    form.append("type", documentType);
    form.append("ownerType", ownerType);
    form.append("title", file.name);
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as any);
    try {
      setBusy(true);
      await api.documents.upload(form);
      setFile(null);
      Alert.alert("Uploaded", "Document uploaded successfully.");
    } catch (err: any) {
      Alert.alert("Upload failed", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={config.title} subtitle={config.subtitle}>
      <Card style={{ gap: 14 }}>
        <Field label="Document type" value={documentType} onChangeText={setDocumentType} />
        <Field label="Owner type" value={ownerType} onChangeText={setOwnerType} />
        <Button label={file ? file.name : "Select File"} variant="outline" onPress={pickFile} />
        <Button label={busy ? "Uploading..." : "Upload Document"} onPress={upload} disabled={busy} />
      </Card>
    </Screen>
  );
}

function NoticeBoardScreen({ config }: { config: ScreenConfig }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [data, setData] = useState<any>(null);

  const load = async () => setData(await api.notices.all());
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const create = async () => {
    const form = new FormData();
    form.append("title", title);
    form.append("content", content);
    form.append("category", "general");
    form.append("targetAudience", "all");
    await api.notices.create(form);
    setTitle("");
    setContent("");
    await load();
  };

  return (
    <Screen title={config.title} subtitle={config.subtitle} action={<Button label="Refresh" variant="outline" onPress={load} />}>
      <Card style={{ gap: 12 }}>
        <Field label="Notice title" value={title} onChangeText={setTitle} />
        <Field label="Content" value={content} onChangeText={setContent} />
        <Button label="Create Notice" onPress={create} />
      </Card>
      {data && <DataList items={listItems(data, "Notice")} />}
    </Screen>
  );
}

function AttendanceScannerScreen({ config }: { config: ScreenConfig }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("Scan an ID card QR code or mark a manual record.");

  const markManual = async () => {
    try {
      await api.attendance.mark({ userType: "staff", userId: "manual", status: "present", date: new Date().toISOString() });
      setStatus("Manual attendance request sent.");
    } catch (err: any) {
      setStatus(err.message);
    }
  };

  const scan = async (code: string) => {
    setScanning(false);
    try {
      const data = await api.attendance.scanIdCard({ code });
      setStatus(`Scan success: ${summarize(data)}`);
    } catch (err: any) {
      setStatus(err.message);
    }
  };

  return (
    <Screen title={config.title} subtitle={config.subtitle}>
      <Card style={{ gap: 12 }}>
        <Text style={styles.itemSubtitle}>{status}</Text>
        {!permission?.granted ? <Button label="Allow Camera" onPress={requestPermission} /> : <Button label={scanning ? "Close Scanner" : "Scan ID Card"} onPress={() => setScanning(!scanning)} />}
        <Button label="Manual Present" variant="outline" onPress={markManual} />
      </Card>
      {permission?.granted && scanning ? (
        <Card style={{ overflow: "hidden", padding: 0 }}>
          <CameraView style={{ height: 320 }} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(result) => scan(result.data)} />
        </Card>
      ) : null}
    </Screen>
  );
}

function PermissionsScreen({ config }: { config: ScreenConfig }) {
  const [data, setData] = useState<any>(null);
  const operations = ["dashboard", "academic", "attendance", "finance", "documents", "id_cards", "notices", "users", "settings"];
  const roles = Object.keys(data?.matrix || { head: [] });
  useEffect(() => {
    api.users.permissions().then(setData).catch(() => undefined);
  }, []);
  return (
    <Screen title={config.title} subtitle={config.subtitle}>
      {roles.map((role) => (
        <Card key={role}>
          <Text style={styles.itemTitle}>{role.replace(/_/g, " ")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {operations.map((operation) => <Badge key={operation} label={`${(data?.matrix?.[role] || []).includes(operation) ? "✓ " : ""}${operation}`} />)}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

function SettingsScreen({ config }: { config: ScreenConfig }) {
  const [values, setValues] = useState<Record<string, boolean>>({
    general: true,
    notification: true,
    idCard: true,
    security: true,
    backup: true
  });
  return (
    <Screen title={config.title} subtitle={config.subtitle}>
      {Object.entries(values).map(([key, value]) => (
        <Card key={key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={styles.itemTitle}>{key.replace(/([A-Z])/g, " $1")}</Text>
            <Text style={styles.itemSubtitle}>Configure {key} preferences</Text>
          </View>
          <Switch value={value} onValueChange={(next) => setValues({ ...values, [key]: next })} />
        </Card>
      ))}
    </Screen>
  );
}
