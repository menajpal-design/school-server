import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from "@react-navigation/drawer";
import React from "react";
import { Text, View } from "react-native";

import { Button } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ResourceScreen } from "../screens/ResourceScreen";
import { theme } from "../theme";
import { canAccess, ScreenConfig, screens } from "./screenConfig";

const Drawer = createDrawerNavigator();

export function AppDrawer() {
  const { user } = useAuth();
  const accessible = screens.filter((screen) => canAccess(screen, user?.role));

  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerMenu {...props} screens={accessible} />}
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.muted
      }}
    >
      {accessible.map((config) => (
        <Drawer.Screen key={config.key} name={config.key} options={{ title: config.title }}>
          {() => <ResourceScreen config={config} />}
        </Drawer.Screen>
      ))}
    </Drawer.Navigator>
  );
}

function DrawerMenu(props: any & { screens: ScreenConfig[] }) {
  const { user, signOut } = useAuth();
  const groups: Record<string, ScreenConfig[]> = {};
  props.screens.forEach((screen: ScreenConfig) => {
    groups[screen.group] = [...(groups[screen.group] || []), screen];
  });

  return (
    <DrawerContentScrollView {...props}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.text }}>DRMS</Text>
        <Text style={{ marginTop: 4, color: theme.colors.muted }}>{user?.name}</Text>
        <Text style={{ marginTop: 2, color: theme.colors.muted, textTransform: "capitalize" }}>{user?.role?.replace(/_/g, " ")}</Text>
      </View>
      {Object.entries(groups).map(([group, items]: [string, ScreenConfig[]]) => (
        <View key={group}>
          <Text style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, color: theme.colors.muted, fontWeight: "700", textTransform: "uppercase", fontSize: 12 }}>{group}</Text>
          {items.map((item) => (
            <DrawerItem key={item.key} label={item.title} onPress={() => props.navigation.navigate(item.key)} focused={props.state.routeNames[props.state.index] === item.key} />
          ))}
        </View>
      ))}
      <View style={{ padding: 16 }}>
        <Button label="Logout" variant="outline" onPress={signOut} />
      </View>
    </DrawerContentScrollView>
  );
}
