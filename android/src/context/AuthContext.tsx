import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { User } from "../types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.multiGet(["token", "user"])
      .then(async ([[, storedToken], [, storedUser]]) => {
        setToken(storedToken);
        if (storedUser) setUser(JSON.parse(storedUser));
        if (storedToken) await refreshProfile();
      })
      .finally(() => setLoading(false));
  }, []);

  const refreshProfile = async () => {
    const data = await api.auth.profile();
    const nextUser = data.user || data;
    setUser(nextUser);
    await AsyncStorage.setItem("user", JSON.stringify(nextUser));
  };

  const signIn = async (email: string, password: string) => {
    const data = await api.auth.login({ email, password });
    await AsyncStorage.setItem("token", data.token);
    await AsyncStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (data: any) => {
    const response = await api.auth.register(data);
    if (response.token) {
      await AsyncStorage.setItem("token", response.token);
      await AsyncStorage.setItem("user", JSON.stringify(response.user));
      setToken(response.token);
      setUser(response.user);
    }
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove(["token", "user"]);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(() => ({ token, user, loading, signIn, register, signOut, refreshProfile }), [token, user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
