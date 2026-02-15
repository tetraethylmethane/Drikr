import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setLanguage } from "../store/slices/languageSlice";

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { currentLanguage } = useAppSelector((state) => state.language);

  const handleLanguageChange = (lang: "en" | "ta") => {
    i18n.changeLanguage(lang);
    dispatch(setLanguage(lang));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView>
        <View style={styles.header}>
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>FM</Text>
          </View>
          <Text style={styles.userName}>Farmer Name</Text>
          <Text style={styles.userEmail}>farmer@email.com</Text>
        </View>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Settings</Text>

        <TouchableOpacity style={styles.settingItem}>
          <Ionicons name="language" size={24} color="#22c55e" />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>Language</Text>
            <View style={styles.languageButtons}>
              <TouchableOpacity
                style={[
                  styles.langBtn,
                  currentLanguage === "en" && styles.langBtnActive,
                ]}
                onPress={() => handleLanguageChange("en")}
              >
                <Text
                  style={[
                    styles.langBtnText,
                    currentLanguage === "en" && styles.langBtnTextActive,
                  ]}
                >
                  English
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.langBtn,
                  currentLanguage === "ta" && styles.langBtnActive,
                ]}
                onPress={() => handleLanguageChange("ta")}
              >
                <Text
                  style={[
                    styles.langBtnText,
                    currentLanguage === "ta" && styles.langBtnTextActive,
                  ]}
                >
                  தமிழ்
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Ionicons name="notifications" size={24} color="#3b82f6" />
          <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Switch
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              thumbColor="#ffffff"
              value={true}
            />
          </View>
        </TouchableOpacity>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Quick Links</Text>

        {[
          { icon: "help-circle", label: "Help & Support", color: "#8b5cf6" },
          { icon: "information-circle", label: "About", color: "#6b7280" },
          {
            icon: "shield-checkmark",
            label: "Privacy Policy",
            color: "#10b981",
          },
          { icon: "log-out", label: "Logout", color: "#ef4444" },
        ].map((item, index) => (
          <TouchableOpacity key={index} style={styles.linkItem}>
            <Ionicons name={item.icon as any} size={24} color={item.color} />
            <Text style={styles.linkLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    backgroundColor: '#071837',
    padding: 20,
    paddingTop: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  profileSection: {
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0b6b3a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e6f7ff',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#9aa9b8',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e6f7ff',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#11324a',
  },
  settingContent: {
    flex: 1,
    marginLeft: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#e6f7ff',
  },
  languageButtons: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#11324a',
  },
  langBtnActive: {
    backgroundColor: '#11324a',
    borderColor: '#38bdf8',
  },
  langBtnText: {
    fontSize: 14,
    color: '#9aa9b8',
    fontWeight: '500',
  },
  langBtnTextActive: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#11324a',
  },
  linkLabel: {
    flex: 1,
    fontSize: 16,
    color: '#e6f7ff',
    marginLeft: 16,
  },
});
