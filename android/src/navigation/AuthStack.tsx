import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";

import { LoginScreen, RegisterScreen } from "../screens/AuthScreens";

const Stack = createNativeStackNavigator();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}
