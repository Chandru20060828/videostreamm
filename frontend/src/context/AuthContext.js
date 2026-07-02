import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

const API = process.env.REACT_APP_API_URL || '/api';

// Apply theme to document
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
};

// Determine theme based on IST time (10am–12pm = light, otherwise dark)
const getISTTheme = () => {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffsetMs);
  const hour = istTime.getUTCHours();
  const minute = istTime.getUTCMinutes();
  const totalMins = hour * 60 + minute;
  // Light theme: 10:00 AM (600 mins) to 12:00 PM (720 mins) IST
  return totalMins >= 600 && totalMins < 720 ? 'light' : 'dark';
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Initialize theme immediately based on IST time for all visitors
  const [theme, setTheme] = useState(() => getISTTheme());

  // Apply the initial time-based theme before any data loads
  useEffect(() => {
    applyTheme(getISTTheme());
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchMe();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Re-check time-based theme every minute for non-logged-in (auto) users
  useEffect(() => {
    const interval = setInterval(() => {
      if (!user || user.theme === 'auto') {
        const istTheme = getISTTheme();
        setTheme(istTheme);
        applyTheme(istTheme);
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchMe = async () => {
    try {
      const res = await axios.get(`${API}/auth/me`);
      setUser(res.data.user);
      // Apply saved theme: if 'auto', use IST time-based; otherwise use saved preference
      const savedTheme = res.data.user.theme;
      const themeToApply = (!savedTheme || savedTheme === 'auto') ? getISTTheme() : savedTheme;
      setTheme(themeToApply);
      applyTheme(themeToApply);
    } catch {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });

    if (res.data.requiresOTP) {
      // Return OTP data to login page — don't set user yet
      return {
        requiresOTP: true,
        userId: res.data.userId,
        message: res.data.message,
        reason: res.data.reason,
        deviceInfo: res.data.deviceInfo,
        city: res.data.city,
        region: res.data.region
      };
    }

    const { token, user: userData, autoTheme } = res.data;
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);

    // Apply IST-based theme for 'auto', otherwise use saved preference
    const themeToApply = (!userData.theme || userData.theme === 'auto') ? getISTTheme() : userData.theme;
    setTheme(themeToApply);
    applyTheme(themeToApply);

    return {
      success: true,
      autoTheme: themeToApply,
      istTime: res.data.istTime,
      isLightHour: res.data.isLightHour
    };
  };

  const verifyOTP = async (userId, otp) => {
    const res = await axios.post(`${API}/auth/verify-otp`, { userId, otp });
    const { token, user: userData } = res.data;
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);

    // Apply IST-based theme for 'auto', otherwise use saved preference
    const themeToApply = (!userData.theme || userData.theme === 'auto') ? getISTTheme() : userData.theme;
    setTheme(themeToApply);
    applyTheme(themeToApply);

    return { success: true };
  };

  const register = async (username, email, password) => {
    const res = await axios.post(`${API}/auth/register`, { username, email, password });

    if (res.data.requiresOTP) {
      // Don't log in yet — caller must verify OTP first
      return {
        requiresOTP: true,
        userId: res.data.userId,
        message: res.data.message,
        reason: res.data.reason,
        deviceInfo: res.data.deviceInfo,
        city: res.data.city,
        region: res.data.region
      };
    }

    const { token, user: userData } = res.data;
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);

    // Apply IST-based theme for 'auto', otherwise use saved preference
    const themeToApply = (!userData.theme || userData.theme === 'auto') ? getISTTheme() : userData.theme;
    setTheme(themeToApply);
    applyTheme(themeToApply);

    return { success: true };
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    // After logout, restore IST time-based theme for visitors
    const istTheme = getISTTheme();
    setTheme(istTheme);
    applyTheme(istTheme);
  };

  // FIX Task 5: updateTheme saves to DB AND updates local state.
  // When newTheme is 'auto', we save 'auto' as the user's preference (so it
  // keeps recomputing on future logins) but apply the *current* IST-based
  // theme to the page right now, since 'auto' itself isn't a renderable theme.
  const updateTheme = async (newTheme) => {
    const themeToRender = newTheme === 'auto' ? getISTTheme() : newTheme;
    setTheme(themeToRender);
    applyTheme(themeToRender);
    if (user) {
      try {
        await axios.patch(`${API}/auth/theme`, { theme: newTheme });
        setUser(prev => ({ ...prev, theme: newTheme }));
      } catch (err) {
        console.error('Failed to save theme:', err.message);
      }
    }
  };

  const updateUser = (updates) => {
    setUser(prev => ({ ...prev, ...updates }));
    if (updates.theme) {
      setTheme(updates.theme);
      applyTheme(updates.theme);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, theme,
      login, verifyOTP, register, logout,
      updateTheme, updateUser, fetchMe
    }}>
      {children}
    </AuthContext.Provider>
  );
};
