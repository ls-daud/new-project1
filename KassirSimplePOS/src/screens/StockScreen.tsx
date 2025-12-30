import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Modal,
  Image,
  FlatList,
  PermissionsAndroid,
  Platform,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { launchCamera, type ImagePickerResponse } from "react-native-image-picker";
import { BottomNav } from "../components/BottomNav";
import { useDataStore } from "../store/dataStore";
import { formatRupiah } from "../utils/money";
import type { Product } from "../api/types";

const LOW_STOCK_THRESHOLD = 10;

export function StockScreen() {
  const nav = useNavigation<any>();
  const products = useDataStore((s) => s.products);
  const setProducts = useDataStore((s) => s.setProducts);
  const addStockChanges = useDataStore((s) => s.addStockChanges);
  const hydrate = useDataStore((s) => s.hydrate);
  const [draft, setDraft] = useState<Product[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [photoStockById, setPhotoStockById] = useState<Record<string, number>>({});
  const [priceEditor, setPriceEditor] = useState<{ id: string; value: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setDraft(products);
    setReasons({});
    setPhotoStockById({});
  }, [products]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await hydrate();
    } catch (e: any) {
      Alert.alert("Sync gagal", e?.message ?? "Tidak bisa refresh data.");
    } finally {
      setRefreshing(false);
    }
  };

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { label: "Habis", color: "#DC2626", bg: "#FEE2E2" };
    if (stock <= LOW_STOCK_THRESHOLD) return { label: "Stok Rendah", color: "#D97706", bg: "#FEF3C7" };
    return { label: "Tersedia", color: "#059669", bg: "#D1FAE5" };
  };

  const originalStockById = useMemo(() => {
    return new Map(products.map((p) => [p.id, p.stock ?? 0]));
  }, [products]);

  const updateStock = (id: string, value: number) => {
    setDraft((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stock: Number.isNaN(value) ? 0 : value } : p))
    );
    setPhotoStockById((prev) => {
      if (!(id in prev)) return prev;
      if (prev[id] === value) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updatePhoto = (id: string, uri: string) => {
    const currentStock = draft.find((p) => p.id === id)?.stock ?? 0;
    setDraft((prev) => prev.map((p) => (p.id === id ? { ...p, photoUri: uri } : p)));
    setPhotoStockById((prev) => ({ ...prev, [id]: currentStock }));
  };

  const openPriceEditor = (product: Product) => {
    setPriceEditor({ id: product.id, value: String(product.price ?? 0) });
  };

  const savePrice = () => {
    if (!priceEditor) return;
    const raw = priceEditor.value.replace(/\D/g, "");
    if (!raw) {
      Alert.alert("Harga kosong", "Masukkan harga baru.");
      return;
    }
    const nextPrice = Number(raw);
    if (!Number.isFinite(nextPrice)) {
      Alert.alert("Harga tidak valid", "Masukkan angka yang benar.");
      return;
    }
    setDraft((prev) => prev.map((p) => (p.id === priceEditor.id ? { ...p, price: nextPrice } : p)));
    setPriceEditor(null);
  };

  const handlePickerResult = (id: string, response: ImagePickerResponse) => {
    if (response.didCancel) return;
    if (response.errorCode) {
      const message =
        response.errorCode === "camera_unavailable"
          ? "Kamera tidak tersedia."
          : response.errorCode === "permission"
            ? "Izin kamera atau galeri ditolak."
            : "Gagal mengambil foto.";
      Alert.alert("Gagal", message);
      return;
    }
    const asset = response.assets?.[0];
    if (!asset?.uri) {
      Alert.alert("Gagal", "Foto tidak ditemukan.");
      return;
    }
    updatePhoto(id, asset.uri);
  };

  const ensureCameraPermission = async () => {
    if (Platform.OS !== "android") return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: "Izin Kamera",
      message: "Aplikasi butuh akses kamera untuk ambil foto stok.",
      buttonPositive: "OK",
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const pickFromCamera = async (id: string) => {
    const allowed = await ensureCameraPermission();
    if (!allowed) return;
    const response = await launchCamera({
      mediaType: "photo",
      quality: 0.8,
      saveToPhotos: false,
      presentationStyle: "fullScreen",
    });
    handlePickerResult(id, response);
  };

  const openPhotoPicker = (id: string) => {
    setTimeout(() => pickFromCamera(id), 250);
  };

  const save = async () => {
    const stamp = Date.now();
    const now = new Date().toISOString();
    const changes = draft
      .filter((item) => {
        const originalStock = originalStockById.get(item.id) ?? 0;
        const currentStock = item.stock ?? 0;
        return currentStock !== originalStock;
      })
      .map((item, index) => {
        const originalStock = originalStockById.get(item.id) ?? 0;
        const currentStock = item.stock ?? 0;
        const reason = (reasons[item.id] ?? "").trim();
        return {
          id: `${item.id}-${stamp}-${index}`,
          productId: item.id,
          productName: item.name,
          fromStock: originalStock,
          toStock: currentStock,
          delta: currentStock - originalStock,
          reason: reason.length > 0 ? reason : undefined,
          photoUri: (item.photoUri ?? "").trim() || undefined,
          createdAt: now,
        };
      });
    const missingPhoto = draft.filter((item) => {
      const originalStock = originalStockById.get(item.id) ?? 0;
      const currentStock = item.stock ?? 0;
      if (currentStock === originalStock) return false;
      return photoStockById[item.id] !== currentStock;
    });
    if (missingPhoto.length > 0) {
      const names = missingPhoto.map((item) => item.name).join(", ");
      Alert.alert("Butuh foto stok", `Ambil foto untuk: ${names}.`);
      return;
    }
    const missingReason = draft.filter((item) => {
      const originalStock = originalStockById.get(item.id) ?? 0;
      const currentStock = item.stock ?? 0;
      if (currentStock >= originalStock) return false;
      return (reasons[item.id] ?? "").trim().length === 0;
    });
    if (missingReason.length > 0) {
      const names = missingReason.map((item) => item.name).join(", ");
      Alert.alert("Butuh alasan", `Masukkan alasan pengurangan stok: ${names}.`);
      return;
    }
    await setProducts(draft);
    if (changes.length > 0) {
      await addStockChanges(changes);
    }
    Alert.alert("Sukses", "Data berhasil diupdate.");
  };

  const priceProduct = priceEditor ? draft.find((p) => p.id === priceEditor.id) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Kelola Stok</Text>
        <Text style={styles.subtitle}>{draft.length} produk</Text>
      </View>

      <View style={styles.content}>
        <FlatList
          data={draft}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#6366F1"]}
              tintColor="#6366F1"
            />
          }
          renderItem={({ item }) => {
            const originalStock = originalStockById.get(item.id) ?? 0;
            const currentStock = item.stock ?? 0;
            const isReduced = currentStock < originalStock;
            const stockStatus = getStockStatus(currentStock);
            const hasChanged = currentStock !== originalStock;
            return (
              <Pressable
                onPress={() => nav.navigate("StockDetail", { productId: item.id })}
                style={[styles.card, hasChanged && styles.cardChanged]}
              >
                <View style={styles.row}>
                  <View style={styles.photoWrap}>
                    {item.photoUri ? (
                      <Image source={{ uri: item.photoUri }} style={styles.photo} />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Text style={styles.photoPlaceholderText}>📦</Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => openPhotoPicker(item.id)}
                      style={styles.cameraButton}
                    >
                      <Text style={styles.cameraIcon}>📷</Text>
                    </Pressable>
                  </View>

                  <View style={styles.infoSection}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>

                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Harga:</Text>
                      <Text style={styles.price}>Rp {formatRupiah(item.price)}</Text>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          openPriceEditor(item);
                        }}
                        style={styles.editPriceBtn}
                      >
                        <Text style={styles.editPriceTxt}>✏️</Text>
                      </Pressable>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: stockStatus.bg }]}>
                      <Text style={[styles.statusText, { color: stockStatus.color }]}>
                        {stockStatus.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stockSection}>
                    <Text style={styles.stockLabel}>Stok</Text>
                    <View style={styles.stockControls}>
                      <Pressable
                        onPress={() => updateStock(item.id, Math.max(0, (item.stock ?? 0) - 1))}
                        style={styles.stockBtnMinus}
                      >
                        <Text style={styles.stockBtnTxt}>−</Text>
                      </Pressable>
                      <TextInput
                        keyboardType="number-pad"
                        value={String(item.stock ?? 0)}
                        onChangeText={(t) => updateStock(item.id, Number(t.replace(/\D/g, "")) || 0)}
                        style={[
                          styles.stockInput,
                          currentStock === 0 && styles.stockInputEmpty,
                          currentStock <= LOW_STOCK_THRESHOLD && currentStock > 0 && styles.stockInputLow,
                        ]}
                      />
                      <Pressable
                        onPress={() => updateStock(item.id, (item.stock ?? 0) + 1)}
                        style={styles.stockBtnPlus}
                      >
                        <Text style={styles.stockBtnTxtPlus}>+</Text>
                      </Pressable>
                    </View>
                    {hasChanged && (
                      <Text style={styles.changeIndicator}>
                        {currentStock > originalStock ? `+${currentStock - originalStock}` : `${currentStock - originalStock}`}
                      </Text>
                    )}
                  </View>
                </View>

                {isReduced && (
                  <View style={styles.reasonWrap}>
                    <Text style={styles.reasonLabel}>⚠️ Alasan pengurangan stok</Text>
                    <TextInput
                      value={reasons[item.id] ?? ""}
                      onChangeText={(text) => setReasons((prev) => ({ ...prev, [item.id]: text }))}
                      placeholder="Contoh: barang rusak, expired, dll"
                      placeholderTextColor="#9CA3AF"
                      style={styles.reasonInput}
                      multiline
                    />
                  </View>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>Belum Ada Produk</Text>
              <Text style={styles.emptySubtitle}>Tarik ke bawah untuk refresh</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <View style={styles.footer}>
        <Pressable onPress={save} style={styles.saveBtn}>
          <Text style={styles.saveTxt}>💾 Simpan Perubahan</Text>
        </Pressable>
      </View>

      <Modal visible={!!priceEditor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ubah Harga</Text>
            {priceProduct ? <Text style={styles.modalName}>{priceProduct.name}</Text> : null}
            <TextInput
              keyboardType="number-pad"
              value={priceEditor?.value ?? ""}
              onChangeText={(text) =>
                setPriceEditor((prev) => (prev ? { ...prev, value: text.replace(/\D/g, "") } : prev))
              }
              placeholder="Masukkan harga"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setPriceEditor(null)} style={styles.modalSecondary}>
                <Text style={styles.modalSecondaryTxt}>Batal</Text>
              </Pressable>
              <Pressable onPress={savePrice} style={styles.modalPrimary}>
                <Text style={styles.modalPrimaryTxt}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <BottomNav active="Stock" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    backgroundColor: "#6366F1",
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
  },
  content: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 100 },
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#fff",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardChanged: {
    borderColor: "#6366F1",
    borderWidth: 2,
    backgroundColor: "#F5F3FF",
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  photoWrap: {
    marginRight: 14,
    position: "relative",
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
  },
  photoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderStyle: "dashed",
  },
  photoPlaceholderText: { fontSize: 24 },
  cameraButton: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  cameraIcon: { fontSize: 14 },
  infoSection: { flex: 1 },
  name: {
    fontWeight: "700",
    color: "#1E293B",
    fontSize: 16,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  priceLabel: {
    color: "#64748B",
    fontSize: 13,
    marginRight: 4,
  },
  price: {
    color: "#1E293B",
    fontWeight: "700",
    fontSize: 15,
  },
  editPriceBtn: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editPriceTxt: { fontSize: 14 },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  stockSection: {
    alignItems: "center",
    minWidth: 120,
  },
  stockLabel: {
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 8,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stockControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
  },
  stockInput: {
    width: 56,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 8,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 16,
    color: "#1E293B",
    marginHorizontal: 4,
  },
  stockInputEmpty: {
    backgroundColor: "#FEE2E2",
    color: "#DC2626",
  },
  stockInputLow: {
    backgroundColor: "#FEF3C7",
    color: "#D97706",
  },
  stockBtnMinus: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  stockBtnPlus: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  stockBtnTxt: {
    fontWeight: "800",
    color: "#DC2626",
    fontSize: 18,
  },
  stockBtnTxtPlus: {
    fontWeight: "800",
    color: "#059669",
    fontSize: 18,
  },
  changeIndicator: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#6366F1",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  reasonWrap: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  reasonLabel: {
    fontWeight: "600",
    color: "#D97706",
    marginBottom: 8,
    fontSize: 13,
  },
  reasonInput: {
    minHeight: 50,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
    color: "#92400E",
    fontSize: 14,
  },
  footer: {
    position: "absolute",
    bottom: 70,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F8FAFC",
  },
  saveBtn: {
    backgroundColor: "#6366F1",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveTxt: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#64748B",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontWeight: "800",
    fontSize: 20,
    color: "#1E293B",
    textAlign: "center",
  },
  modalName: {
    marginTop: 8,
    color: "#64748B",
    fontWeight: "600",
    textAlign: "center",
    fontSize: 15,
  },
  modalInput: {
    marginTop: 20,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    textAlign: "center",
    fontWeight: "800",
    color: "#1E293B",
    fontSize: 24,
  },
  modalActions: {
    marginTop: 20,
    flexDirection: "row",
    gap: 12,
  },
  modalSecondary: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSecondaryTxt: {
    fontWeight: "700",
    color: "#64748B",
    fontSize: 15,
  },
  modalPrimary: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  modalPrimaryTxt: {
    fontWeight: "700",
    color: "#fff",
    fontSize: 15,
  },
});
