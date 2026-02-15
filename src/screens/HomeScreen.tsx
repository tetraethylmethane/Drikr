import React, { useState } from "react";
import { useAppDispatch } from '../store/hooks';
import { setStateName } from '../store/slices/locationSlice';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Card from "../components/Card";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import indianDistricts from '../config/indianDistricts';

const { width } = Dimensions.get("window");

export default function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const dispatch = useAppDispatch();
  const [stateModalVisible, setStateModalVisible] = useState(false);
  const [selectedState, setSelectedState] = useState<string>('Tamil Nadu');

  const services: Array<{
    id: string;
    icon: string;
    label: string;
    description: string;
    color: string;
    gradient: readonly [string, string];
    screen: string;
  }> = [
    {
      id: "crop",
      icon: "leaf",
      label: "Crop Recommendation",
      description: "Get AI-powered crop suggestions",
      color: "#22c55e",
  gradient: ["#22c55e", "#16a34a"] as const,
      screen: "Crop",
    },
    {
      id: "disease",
      icon: "bug",
      label: "Disease Detection",
      description: "Identify plant diseases",
      color: "#ef4444",
  gradient: ["#ef4444", "#dc2626"] as const,
      screen: "DiseaseDetection",
    },
    {
      id: "pest",
      icon: "bug-outline",
      label: "Pest Detection",
      description: "Detect and control pests",
      color: "#8b5cf6",
  gradient: ["#8b5cf6", "#7c3aed"] as const,
      screen: "PestDetection",
    },
    {
      id: "market",
      icon: "trending-up",
      label: "Market Prices",
      description: "Check live market rates",
      color: "#3b82f6",
  gradient: ["#3b82f6", "#2563eb"] as const,
      screen: "Market",
    },
    {
      id: "profit",
      icon: "calculator",
      label: "Profit & Loss",
      description: "Analyze your farming costs",
      color: "#f59e0b",
  gradient: ["#f59e0b", "#d97706"] as const,
      screen: "ProfitLoss",
    },
    {
      id: "chat",
      icon: "chatbubbles",
      label: "AI Assistant",
      description: "Ask farming questions",
      color: "#ec4899",
  gradient: ["#ec4899", "#db2777"] as const,
      screen: "ChatAssistant",
    },
    {
      id: "weather",
      icon: "partly-sunny",
      label: "Weather Forecast",
      description: "7-day weather predictions",
      color: "#06b6d4",
  gradient: ["#06b6d4", "#0891b2"] as const,
      screen: "Weather",
    },
    {
      id: "community",
      icon: "people",
      label: "Community",
      description: "Connect with farmers",
      color: "#14b8a6",
  gradient: ["#14b8a6", "#0d9488"] as const,
      screen: "Community",
    },
  ];

  const navigateToScreen = (screenName: string) => {
    setSidebarVisible(false);
    (navigation as any).navigate(screenName);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Sidebar Menu */}
      <Modal
        visible={sidebarVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSidebarVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSidebarVisible(false)}
          />
          <View style={styles.sidebar}>
            <View style={styles.sidebarHeader}>
              <View style={styles.sidebarHeaderContent}>
                <Text style={styles.sidebarTitle}>Drikr</Text>
                <Text style={styles.sidebarSubtitle}>All Features</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSidebarVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={28} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
              {services.map((service) => (
                <TouchableOpacity
                  key={service.id}
                  style={styles.menuItem}
                  onPress={() => navigateToScreen(service.screen)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: service.color + "20" },
                    ]}
                  >
                    <Ionicons
                      name={service.icon as any}
                      size={24}
                      color={service.color}
                    />
                  </View>
                  <View style={styles.menuTextContainer}>
                    <Text style={styles.menuLabel}>{service.label}</Text>
                    <Text style={styles.menuDescription}>{service.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <LinearGradient
          colors={["#000000", "#071840"] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
            <View style={styles.headerContent}>
              <View style={styles.welcomeSection}>
                <View style={styles.headerTop}>
                  {/* Top-left small icon */}
                  {/* Replace three-dash menu with header image */}
                  <Image
                    source={require("../../assets/images/header.png")}
                    style={styles.headerImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.greeting}>🍃 Drikr</Text>
                </View>
                <Text style={styles.welcomeText}>
                  Your AI-Powered Farming Assistant
                </Text>
              </View>

              {/* Move menu button to top-right and add label; remove white avatar */}
              <View style={styles.avatarContainer}>
                <TouchableOpacity
                  style={styles.stateButton}
                  onPress={() => setStateModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location" size={16} color="#ffffff" />
                  <Text style={styles.stateText}>{selectedState}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.moreInfoButton}
                  onPress={() => setSidebarVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#ffffff" />
                  <Text style={styles.moreInfoText}>More info</Text>
                </TouchableOpacity>
              </View>

              {/* State selector modal */}
              <Modal
                visible={stateModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setStateModalVisible(false)}
              >
                <View style={styles.stateModalOverlay}>
                  <View style={styles.stateModalContainer}>
                    <Text style={styles.stateModalTitle}>Select State</Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        {Object.keys(indianDistricts).map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={styles.stateItem}
                            onPress={() => { setSelectedState(s); setStateModalVisible(false); dispatch(setStateName(s)); }}
                          >
                            <Text style={styles.stateItemText}>{s}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    <TouchableOpacity style={styles.stateClose} onPress={() => setStateModalVisible(false)}>
                      <Text style={styles.stateCloseText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            </View>
          
          {/* Weather / Field Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Ionicons name="sunny" size={20} color="#fbbf24" />
              <Text style={styles.metricValue}>28°C</Text>
              <Text style={styles.metricLabel}>Temperature</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="speedometer" size={20} color="#60a5fa" />
              <Text style={styles.metricValue}>12 km/h</Text>
              <Text style={styles.metricLabel}>Wind</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="rainy" size={20} color="#60a5fa" />
              <Text style={styles.metricValue}>2 mm</Text>
              <Text style={styles.metricLabel}>Rainfall</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="water" size={20} color="#06b6d4" />
              <Text style={styles.metricValue}>32%</Text>
              <Text style={styles.metricLabel}>Moisture</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Services Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Explore Features</Text>
          <Text style={styles.sectionSubtitle}>
            Tap on any card to get started
          </Text>

          <View style={styles.servicesGrid}>
            {services.map((service, index) => (
              <TouchableOpacity
                key={service.id}
                activeOpacity={0.7}
                style={styles.serviceCard}
                onPress={() => navigateToScreen(service.screen)}
              >
                <LinearGradient
                  colors={service.gradient as readonly [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.serviceCardContent}
                >
                  <View style={styles.serviceIconContainer}>
                    <Ionicons
                      name={service.icon as any}
                      size={32}
                      color="#ffffff"
                    />
                  </View>
                  <Text style={styles.serviceLabel}>{service.label}</Text>
                  <Text style={styles.serviceDescription}>
                    {service.description}
                  </Text>
                  <View style={styles.arrowContainer}>
                    <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Weather Forecast Card */}
        <View style={styles.section}>
          <Card style={styles.weatherCard}>
            <View style={styles.weatherCardHeader}>
              <View style={styles.weatherTitleContainer}>
                <Ionicons name="partly-sunny" size={24} color="#f59e0b" />
                <Text style={styles.weatherCardTitle}>7-Day Forecast</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigateToScreen("Weather")}
              >
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.forecastRow}>
              <View style={styles.forecastItem}>
                <Text style={styles.forecastDay}>Today</Text>
                <Ionicons name="sunny" size={32} color="#f59e0b" />
                <Text style={styles.forecastTemp}>28°C</Text>
              </View>
              <View style={styles.forecastItem}>
                <Text style={styles.forecastDay}>Tomorrow</Text>
                <Ionicons name="cloud" size={32} color="#6b7280" />
                <Text style={styles.forecastTemp}>26°C</Text>
              </View>
              <View style={styles.forecastItem}>
                <Text style={styles.forecastDay}>Day 3</Text>
                <Ionicons name="sunny" size={32} color="#f59e0b" />
                <Text style={styles.forecastTemp}>27°C</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Top Market Prices Card */}
        <View style={styles.section}>
          <Card style={styles.marketCard}>
            <View style={styles.marketCardHeader}>
              <View style={styles.marketTitleContainer}>
                <Ionicons name="trending-up" size={24} color="#3b82f6" />
                <Text style={styles.marketCardTitle}>Top Prices</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigateToScreen("Market")}
              >
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.priceList}>
              <View style={styles.priceItem}>
                <View style={styles.priceItemInfo}>
                  <Text style={styles.cropName}>Rice</Text>
                  <Text style={styles.cropTamil}>அரிசி</Text>
                </View>
                <View style={styles.priceRight}>
                  <Text style={styles.cropPrice}>₹45/kg</Text>
                  <Text style={styles.priceTrend}>↑ +5%</Text>
                </View>
              </View>
              <View style={styles.priceItem}>
                <View style={styles.priceItemInfo}>
                  <Text style={styles.cropName}>Wheat</Text>
                  <Text style={styles.cropTamil}>கோதுமை</Text>
                </View>
                <View style={styles.priceRight}>
                  <Text style={styles.cropPrice}>₹38/kg</Text>
                  <Text style={[styles.priceTrend, styles.trendDown]}>↓ -2%</Text>
                </View>
              </View>
              <View style={styles.priceItem}>
                <View style={styles.priceItemInfo}>
                  <Text style={styles.cropName}>Tomato</Text>
                  <Text style={styles.cropTamil}>தக்காளி</Text>
                </View>
                <View style={styles.priceRight}>
                  <Text style={styles.cropPrice}>₹60/kg</Text>
                  <Text style={styles.priceTrend}>↑ +8%</Text>
                </View>
              </View>
            </View>
          </Card>
        </View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
  flex: 1,
  backgroundColor: "#000000",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
  paddingTop: 12,
  paddingBottom: 16,
  paddingHorizontal: 8,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    backgroundColor: 'transparent',
  },
  headerContent: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 10,
  },
  welcomeSection: {
  flex: 1,
  alignItems: 'flex-start',
  },
  headerTop: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: 'flex-start',
  gap: 12,
  marginBottom: 4,
  },
  headerImage: {
    width: 40,
    height: 40,
  marginRight: 6,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  greeting: {
    fontSize: 20,
    fontWeight: "600",
  color: "#E6F7FF",
  alignSelf: 'flex-start',
  marginLeft: -50,
  },
  welcomeText: {
    fontSize: 14,
    color: "#9FD3FF",
    lineHeight: 20,
  },
  avatarContainer: {
    marginLeft: 16,
  },
  topRightMenuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  moreInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  moreInfoText: {
    color: '#ffffff',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 14,
  },
  avatarIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#071837",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  statsContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(30,64,175,0.12)",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 8,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  metricCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E6F7FF',
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: '#9FD3FF',
    marginTop: 2,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
  },
  statLabel: {
    fontSize: 12,
    color: "#dcfce7",
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#E6F7FF",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#9FD3FF",
    marginBottom: 16,
  },
  servicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  serviceCard: {
    width: (width - 44) / 2,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 4,
  },
  serviceCardContent: {
    padding: 20,
    minHeight: 160,
    justifyContent: "space-between",
  },
  serviceIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  serviceLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#E6F7FF",
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: 12,
    color: "rgba(159,211,255,0.9)",
    lineHeight: 18,
  },
  arrowContainer: {
    alignSelf: "flex-end",
    marginTop: 8,
  },
  weatherCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
  },
  weatherCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  weatherTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  weatherCardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e293b",
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3b82f6",
  },
  forecastRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  forecastItem: {
    alignItems: "center",
    gap: 8,
  },
  forecastDay: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
  },
  forecastTemp: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1e293b",
  },
  marketCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
  },
  marketCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  marketTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  marketCardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e293b",
  },
  priceList: {
    gap: 12,
  },
  priceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
  },
  priceItemInfo: {
    flex: 1,
  },
  cropName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 2,
  },
  cropTamil: {
    fontSize: 12,
    color: "#64748b",
  },
  priceRight: {
    alignItems: "flex-end",
  },
  cropPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#22c55e",
    marginBottom: 2,
  },
  priceTrend: {
    fontSize: 12,
    fontWeight: "600",
    color: "#22c55e",
  },
  trendDown: {
    color: "#ef4444",
  },
  bottomSpacer: {
    height: 100,
  },
  // Sidebar Styles
  modalContainer: {
    flex: 1,
    flexDirection: "row",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sidebar: {
    width: width * 0.85,
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
  },
  sidebarHeader: {
    backgroundColor: "#22c55e",
    padding: 20,
    paddingTop: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sidebarHeaderContent: {
    flex: 1,
  },
  sidebarTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  sidebarSubtitle: {
    fontSize: 14,
    color: "#dcfce7",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  menuContainer: {
    flex: 1,
    paddingVertical: 8,
  },
  stateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  stateText: {
    color: '#ffffff',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 13,
  },
  stateModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  stateModalContainer: {
    backgroundColor: '#ffffff',
    maxHeight: '60%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
  },
  stateModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  stateItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  stateItemText: {
    fontSize: 16,
    color: '#0f172a',
  },
  stateClose: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  stateCloseText: {
    color: '#2563eb',
    fontWeight: '700',
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 12,
    color: "#64748b",
  },
});
