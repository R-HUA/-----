import { useQuery } from "@tanstack/react-query";

export function useTextContent(url: string, maxBytes = 2 * 1024 * 1024) {
  return useQuery({
    queryKey: ["text-content", url, maxBytes],
    queryFn: async () => {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch artifact content");
      const text = await response.text();
      return {
        text: text.length > maxBytes ? text.slice(0, maxBytes) : text,
        truncated: text.length > maxBytes
      };
    }
  });
}
