import { Printer, ColumnAlignment, COMMANDS } from "react-native-thermal-receipt-printer-image-qr";
import type { TransactionCreateResponse, CartLine } from "../api/types";
import { formatRupiah } from "../utils/money";

export async function printReceipt58mm(params: {
  storeName?: string;
  tx: TransactionCreateResponse;
  lines: CartLine[];
  note?: string;
}): Promise<void> {
  const { storeName = "Kedai jamu dan wedang rempah Sanjaya", tx, lines, note } = params;

  const BOLD_ON = COMMANDS.TEXT_FORMAT.TXT_BOLD_ON;
  const BOLD_OFF = COMMANDS.TEXT_FORMAT.TXT_BOLD_OFF;
  const CENTER = COMMANDS.TEXT_FORMAT.TXT_ALIGN_CT;
  const LEFT = COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT;
  const NEWLINE = "\n";

  const header =
    `${CENTER}${BOLD_ON}${storeName}${BOLD_OFF}${NEWLINE}` +
    `${CENTER}Receipt: ${tx.receiptNo}${NEWLINE}` +
    `${CENTER}${new Date(tx.createdAt).toLocaleString()}${NEWLINE}${NEWLINE}`;
  Printer.printText(header);

  const colAlign = [ColumnAlignment.LEFT, ColumnAlignment.CENTER, ColumnAlignment.RIGHT] as any;
  const colWidth = [18, 4, 8]; // total 30 chars

  Printer.printColumnsText(["Item", "Qty", "Rp"], colWidth, colAlign, [`${BOLD_ON}`, "", ""], {});

  lines.forEach((l) => {
    const name = l.name.length > 18 ? `${l.name.slice(0, 17)}...` : l.name;
    Printer.printColumnsText(
      [name, String(l.qty), formatRupiah(l.unitPrice * l.qty)],
      colWidth,
      colAlign,
      [`${BOLD_OFF}`, "", ""],
      {}
    );
  });

  Printer.printText(`${LEFT}${NEWLINE}`);
  const methodLabel = tx.paymentMethod === "QRIS" ? "QRIS" : "Tunai";
  Printer.printText(`${LEFT}METODE : ${methodLabel}${NEWLINE}`);
  Printer.printText(`${LEFT}TOTAL  : ${formatRupiah(tx.totalAmount)}${NEWLINE}`);
  Printer.printText(`${LEFT}BAYAR  : ${formatRupiah(tx.paidAmount)}${NEWLINE}`);
  Printer.printText(`${LEFT}KEMBALI: ${formatRupiah(tx.changeAmount)}${NEWLINE}`);

  if (note?.trim()) {
    Printer.printText(`${LEFT}${NEWLINE}Catatan: ${note.trim()}${NEWLINE}`);
  }

  Printer.printBill(`${CENTER}${NEWLINE}Terima kasih${NEWLINE}${NEWLINE}`);
}
