import React, { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";

import { theme } from "../theme";

export function Screen({ title, subtitle, children, action }: PropsWithChildren<{ title: string; subtitle?: string; action?: React.ReactNode }>) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ label, onPress, variant = "primary", disabled }: { label: string; onPress?: () => void; variant?: "primary" | "outline" | "danger"; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, variant === "outline" && styles.buttonOutline, variant === "danger" && styles.buttonDanger, disabled && { opacity: 0.55 }]}>
      <Text style={[styles.buttonText, variant === "outline" && styles.buttonOutlineText]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, secureTextEntry, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; secureTextEntry?: boolean; placeholder?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry} placeholder={placeholder || label} placeholderTextColor={theme.colors.muted} style={styles.input} autoCapitalize="none" />
    </View>
  );
}

export function StatCard({ label, value, tone = "blue" }: { label: string; value: React.ReactNode; tone?: "blue" | "emerald" | "amber" | "rose" }) {
  const color = theme.colors[tone];
  return (
    <Card style={{ flex: 1, minWidth: 145 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </Card>
  );
}

export function Badge({ label, tone = "slate" }: { label: string; tone?: "slate" | "blue" | "emerald" | "amber" | "rose" }) {
  const color = tone === "slate" ? theme.colors.primary : theme.colors[tone];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function LoadingState() {
  return <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />;
}

export function EmptyState({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function DataList({ items }: { items: { title: string; subtitle?: string; meta?: string }[] }) {
  if (!items.length) return <EmptyState text="No records found." />;
  return (
    <View style={{ gap: 12 }}>
      {items.map((item, index) => (
        <Card key={`${item.title}-${index}`}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          {item.subtitle ? <Text style={styles.itemSubtitle}>{item.subtitle}</Text> : null}
          {item.meta ? <Text style={styles.itemMeta}>{item.meta}</Text> : null}
        </Card>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  screenContent: { padding: 16, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: theme.radius, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  title: { fontSize: 24, fontWeight: "700", color: theme.colors.text },
  subtitle: { marginTop: 6, fontSize: 14, lineHeight: 20, color: theme.colors.muted },
  card: { borderRadius: theme.radius, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 16 },
  button: { minHeight: 44, borderRadius: 6, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonDanger: { backgroundColor: theme.colors.rose },
  buttonOutline: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  buttonText: { color: "white", fontWeight: "700" },
  buttonOutlineText: { color: theme.colors.text },
  label: { color: theme.colors.text, fontWeight: "600" },
  input: { minHeight: 44, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "white", paddingHorizontal: 12, color: theme.colors.text },
  statLabel: { color: theme.colors.muted, fontSize: 13, fontWeight: "600" },
  statValue: { marginTop: 8, fontSize: 22, fontWeight: "800" },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  empty: { padding: 24, textAlign: "center", color: theme.colors.muted },
  itemTitle: { color: theme.colors.text, fontWeight: "700", fontSize: 16 },
  itemSubtitle: { marginTop: 6, color: theme.colors.muted, lineHeight: 20 },
  itemMeta: { marginTop: 10, color: theme.colors.muted, fontSize: 12 }
});
