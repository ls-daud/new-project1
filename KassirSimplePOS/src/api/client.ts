import axios from "axios";

export const api = axios.create({
  baseURL: "https://YOUR_BACKEND_BASE_URL", // ganti
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  config.headers["Content-Type"] = "application/json";
  return config;
});
