import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SaleScreen } from "../screens/SaleScreen";
import { PaymentScreen } from "../screens/PaymentScreen";
import { ReceiptScreen } from "../screens/ReceiptScreen";
import { StockScreen } from "../screens/StockScreen";
import { StockDetailScreen } from "../screens/StockDetailScreen";
import { ReportScreen } from "../screens/ReportScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { PrinterSetupScreen } from "../screens/PrinterSetupScreen";
import { useDataStore } from "../store/dataStore";

export type RootStackParamList = {
  Sale: undefined;
  Payment: undefined;
  Receipt: { localId: string };
  Stock: undefined;
  StockDetail: { productId: string };
  Report: undefined;
  History: undefined;
  PrinterSetup: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const hydrate = useDataStore((s) => s.hydrate);
  const syncPendingTransactions = useDataStore((s) => s.syncPendingTransactions);

  useEffect(() => {
    const run = async () => {
      await hydrate();
      await syncPendingTransactions();
    };
    run();
  }, [hydrate, syncPendingTransactions]);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Sale">
        <Stack.Screen name="Sale" component={SaleScreen} options={{ title: "Dashboard Kasir" }} />
        <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: "Pembayaran" }} />
        <Stack.Screen name="Receipt" component={ReceiptScreen} options={{ title: "Struk" }} />
        <Stack.Screen name="Stock" component={StockScreen} options={{ title: "Stok" }} />
        <Stack.Screen
          name="StockDetail"
          component={StockDetailScreen}
          options={{ title: "Detail Stok" }}
        />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: "Produk Terjual" }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: "Riwayat" }} />
        <Stack.Screen
          name="PrinterSetup"
          component={PrinterSetupScreen}
          options={{ title: "Setting Printer" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
