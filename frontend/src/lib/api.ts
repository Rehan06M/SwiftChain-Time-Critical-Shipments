
const API_URL =
  import.meta.env.VITE_API_URL ??
  "http://localhost:5000/api";

export interface User {
  id: string;
  fullName: string;
  email: string;
  organizationName: string | null;
  role: "shipper" | "dispatcher" | "carrier";
}

export interface AuthResponse {
  message: string;
  user: User;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ?? "Something went wrong"
    );
  }

  return data as T;
}
