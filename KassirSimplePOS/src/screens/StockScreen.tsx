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
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { launchCamera, type ImagePickerResponse } from "react-native-image-picker";
import { BottomNav } from "../components/BottomNav";
import { useDataStore } from "../store/dataStore";
import { formatRupiah } from "../utils/money";
import type { Product } from "../api/types";

export function StockScreen() {
  const nav = useNavigation<any>();
  const products = useDataStore((s) => s.products);
  const setProducts = useDataStore((s) => s.setProducts);
  const addStockChanges = useDataStore((s) => s.addStockChanges);
  const [draft, setDraft] = useState<Product[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [photoStockById, setPhotoStockById] = useState<Record<string, number>>({});
  const [priceEditor, setPriceEditor] = useState<{ id: string; value: string } | null>(null);

  useEffect(() => {
    setDraft(products);
    setReasons({});
    setPhotoStockById({});
  }, [products]);

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
      <View style={styles.content}>
        <Text style={styles.title}>Stok</Text>
        <FlatList
          data={draft}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const originalStock = originalStockById.get(item.id) ?? 0;
            const currentStock = item.stock ?? 0;
            const isReduced = currentStock < originalStock;
            return (
              <Pressable
                onPress={() => nav.navigate("StockDetail", { productId: item.id })}
                style={styles.card}
              >
                <View style={styles.row}>
                  <View style={styles.photoWrap}>
                    {item.photoUri ? (
                      <Image source={{ uri: item.photoUri }} style={styles.photo} />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Text style={styles.photoTxt}>FOTO</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.price}>Rp {formatRupiah(item.price)}</Text>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          openPriceEditor(item);
                        }}
                        style={styles.priceEditBtn}
                      >
                        <Text style={styles.priceEditTxt}>Edit</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.stockBox}>
                    <Text style={styles.stockLabel}>Stok</Text>
                    <View style={styles.stockControls}>
                      <Pressable
                        onPress={() => updateStock(item.id, Math.max(0, (item.stock ?? 0) - 1))}
                        style={styles.stockBtn}
                      >
                        <Text style={styles.stockBtnTxt}>-</Text>
                      </Pressable>
                      <TextInput
                        keyboardType="number-pad"
                        value={String(item.stock ?? 0)}
                        onChangeText={(t) => updateStock(item.id, Number(t.replace(/\D/g, "")) || 0)}
                        style={styles.stockInput}
                      />
                      <Pressable
                        onPress={() => updateStock(item.id, (item.stock ?? 0) + 1)}
                        style={styles.stockBtn}
                      >
                        <Text style={styles.stockBtnTxt}>+</Text>
                      </Pressable>
                      <Pressable onPress={() => openPhotoPicker(item.id)} style={styles.photoBtn}>
                        <Text style={styles.photoBtnTxt}>FOTO</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
                {isReduced ? (
                  <View style={styles.reasonWrap}>
                    <Text style={styles.reasonLabel}>Alasan pengurangan</Text>
                    <TextInput
                      value={reasons[item.id] ?? ""}
                      onChangeText={(text) => setReasons((prev) => ({ ...prev, [item.id]: text }))}
                      placeholder="Contoh: barang rusak"
                      style={styles.reasonInput}
                      multiline
                    />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada produk.</Text>}
        />

        <Pressable onPress={save} style={styles.saveBtn}>
          <Text style={styles.saveTxt}>Simpan Perubahan</Text>
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
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 12 },
  title: { fontSize: 18, fontWeight: "900", color: "#111", marginBottom: 8 },
  card: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#f7f7f7",
    marginBottom: 10,
  },
  row: { flexDirection: "row", alignItems: "center" },
  photoWrap: { marginRight: 12 },
  photo: { width: 54, height: 54, borderRadius: 12, backgroundColor: "#eee" },
  photoPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: "#e9e9e9",
    alignItems: "center",
    justifyContent: "center",
  },
  photoTxt: { fontWeight: "900", color: "#888", fontSize: 11 },
  name: { fontWeight: "900", color: "#111" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  price: { color: "#666" },
  priceEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  priceEditTxt: { fontWeight: "800", color: "#444", fontSize: 12 },
  stockBox: { alignItems: "flex-end" },
  stockLabel: { fontWeight: "800", color: "#444", marginBottom: 6 },
  stockControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  stockInput: {
    width: 90,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    paddingVertical: 8,
    textAlign: "center",
    fontWeight: "900",
  },
  stockBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  stockBtnTxt: { fontWeight: "900", color: "#111", fontSize: 16 },
  photoBtn: {
    width: 44,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e6e6e6",
    alignItems: "center",
    justifyContent: "center",
  },
  photoBtnTxt: { fontWeight: "900", color: "#555", fontSize: 11 },
  reasonWrap: { marginTop: 10 },
  reasonLabel: { fontWeight: "800", color: "#444", marginBottom: 6 },
  reasonInput: {
    minHeight: 44,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  saveBtn: {
    marginTop: 8,
    backgroundColor: "#e23c33",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  saveTxt: { color: "#fff", fontWeight: "900" },
  empty: { padding: 16, color: "#666" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  modalTitle: { fontWeight: "900", fontSize: 16, color: "#111" },
  modalName: { marginTop: 6, color: "#666", fontWeight: "700" },
  modalInput: {
    marginTop: 12,
    backgroundColor: "#f7f7f7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    textAlign: "center",
    fontWeight: "900",
    color: "#111",
  },
  modalActions: { marginTop: 14, flexDirection: "row", gap: 10 },
  modalSecondary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    paddingVertical: 12,
    alignItems: "center",
  },
  modalSecondaryTxt: { fontWeight: "900", color: "#555" },
  modalPrimary: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#e23c33",
    paddingVertical: 12,
    alignItems: "center",
  },
  modalPrimaryTxt: { fontWeight: "900", color: "#fff" },
});
