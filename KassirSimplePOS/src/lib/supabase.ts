import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const SUPABASE_URL = "https://tqsmeypvecijbangnrdr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxc21leXB2ZWNpamJhbmducmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMDY2MzIsImV4cCI6MjA4MjY4MjYzMn0.BGFfVRItqHk-nl40kQPFTkPlWUgeVTXFDj0bxj0A3Do";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const BUCKET_NAME = "stock-photos";

export async function uploadStockPhoto(localUri: string): Promise<string | null> {
  try {
    if (!localUri || localUri.startsWith("http")) {
      return localUri || null;
    }

    const filename = `stock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const uri = Platform.OS === "android" ? localUri : localUri.replace("file://", "");

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage.from(BUCKET_NAME).upload(filename, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });

    if (error) {
      console.error("Upload error:", error);
      return null;
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
    return publicUrlData?.publicUrl || null;
  } catch (err) {
    console.error("Upload exception:", err);
    return null;
  }
}

export function getStorageUrl(): string {
  return SUPABASE_URL;
}
