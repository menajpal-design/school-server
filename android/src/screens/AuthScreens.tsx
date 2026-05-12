import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { Button, Card, Field, styles } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";

export function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("head@demoschool.edu");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    try {
      setLoading(true);
      await signIn(email, password);
    } catch (error: any) {
      Alert.alert("Login failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="DRMS" subtitle="School management on mobile">
      <Field label="Email" value={email} onChangeText={setEmail} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Button label={loading ? "Signing in..." : "Login"} onPress={submit} disabled={loading} />
      <Button label="Create Account" variant="outline" onPress={() => navigation.navigate("Register")} />
    </AuthShell>
  );
}

export function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", institutionId: "", role: "student" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    try {
      setLoading(true);
      await register(form);
    } catch (error: any) {
      Alert.alert("Registration failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Register" subtitle="Create a DRMS account">
      <Field label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
      <Field label="Email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} />
      <Field label="Password" value={form.password} onChangeText={(password) => setForm({ ...form, password })} secureTextEntry />
      <Field label="Role" value={form.role} onChangeText={(role) => setForm({ ...form, role })} />
      <Field label="Institution ID" value={form.institutionId} onChangeText={(institutionId) => setForm({ ...form, institutionId })} />
      <Button label={loading ? "Creating..." : "Register"} onPress={submit} disabled={loading} />
      <Button label="Back to Login" variant="outline" onPress={() => navigation.navigate("Login")} />
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", padding: 16 }}>
      <Card style={{ gap: 16 }}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {children}
      </Card>
    </KeyboardAvoidingView>
  );
}
