import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  api,
  ApiAccuracy,
  ApiIssueList,
  ApiIngestKey,
  ApiIngestKeyCreated,
  ApiLogFacets,
  ApiLogList,
  ApiMe,
  ApiOverview,
  ApiProvider,
  ApiRule,
  ApiSettings,
  ApiSettingsUpdate,
  fromApiIssue,
  fromApiLog,
  fromApiOverview,
  fromApiProvider,
  fromApiSettings,
  Settings,
  LogEntry,
  toApiSettingsUpdate,
} from "../lib/api";

const get = async <T,>(url: string, params?: object) => (await api.get<T>(url, { params })).data;

export const useMe = (userId: string | null, enabled = true) =>
  useQuery({
    queryKey: ["me", userId],
    queryFn: () => get<ApiMe>("/me"),
    enabled: enabled && userId !== null,
    refetchInterval: 15_000,
  });

export const useSettings = () =>
  useQuery({
    queryKey: ["settings"],
    queryFn: async () => fromApiSettings(await get<ApiSettings>("/settings")),
  });

export const useOverview = () =>
  useQuery({
    queryKey: ["overview"],
    queryFn: async () => fromApiOverview(await get<ApiOverview>("/overview")),
    refetchInterval: 15_000,
  });

export interface IssueFilters {
  provider?: string;
  severity?: string;
  tier?: string;
}

export const useIssues = (f: IssueFilters) => {
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v && v !== "all"));
  return useQuery({
    queryKey: ["issues", params],
    queryFn: async () => (await get<ApiIssueList>("/issues", params)).items.map(fromApiIssue),
    refetchInterval: 15_000,
  });
};

export const useProviders = () =>
  useQuery({
    queryKey: ["providers"],
    queryFn: async () => (await get<ApiProvider[]>("/providers")).map(fromApiProvider),
  });

export const useIngestKeys = () =>
  useQuery({
    queryKey: ["ingestKeys"],
    queryFn: () => get<ApiIngestKey[]>("/ingest-keys"),
    staleTime: 30_000,
  });

export const useCreateIngestKey = () => {
  const queryClient = useQueryClient();
  return async (name: string): Promise<ApiIngestKeyCreated> => {
    const created = (await api.post<ApiIngestKeyCreated>("/ingest-keys", { name })).data;
    const safeKey: ApiIngestKey = {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      created_at: created.created_at,
      last_used_at: null,
      revoked_at: null,
    };
    queryClient.setQueryData<ApiIngestKey[]>(["ingestKeys"], (keys) => [
      safeKey,
      ...(keys ?? []).filter((key) => key.id !== safeKey.id),
    ]);
    return created;
  };
};

export const useRevokeIngestKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      await api.delete(`/ingest-keys/${keyId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ingestKeys"] }),
    onError: () => toast.error("Couldn't revoke this ingest key. Please try again."),
  });
};

export const useRules = () =>
  useQuery({ queryKey: ["rules"], queryFn: () => get<ApiRule[]>("/rules"), staleTime: Infinity });
export const useEvaluation = () =>
  useQuery({ queryKey: ["evaluate"], queryFn: () => get<ApiAccuracy>("/accuracy") });

export interface LogFilters {
  search?: string;
  provider?: string;
  status_class?: string;
  endpoint?: string;
  caller?: string;
  model?: string;
  issue_id?: string;
  from?: string;
  to?: string;
}

export interface LogPage {
  items: LogEntry[];
  next_cursor: string | null;
}

export const buildLogQueryParams = (filters: LogFilters, cursor?: string | null) => {
  const search = filters.search?.trim();
  return {
    limit: 200,
    ...(search && search.length >= 4 ? { q: search } : {}),
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(filters.status_class ? { status_class: filters.status_class } : {}),
    ...(filters.endpoint ? { endpoint: filters.endpoint } : {}),
    ...(filters.caller ? { caller: filters.caller } : {}),
    ...(filters.model ? { model: filters.model } : {}),
    ...(filters.issue_id ? { issue_id: filters.issue_id } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(cursor ? { cursor } : {}),
  };
};

export const useLogs = (filters: LogFilters) => {
  const normalizedFilters = {
    ...filters,
    search: (filters.search?.trim().length ?? 0) >= 4 ? filters.search?.trim() : undefined,
  };
  return useInfiniteQuery({
    queryKey: ["logs", normalizedFilters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await get<ApiLogList>("/logs", buildLogQueryParams(filters, pageParam));
      return {
        items: response.items.map(fromApiLog),
        next_cursor: response.next_cursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    refetchInterval: 15_000,
  });
};

export const useLogFacets = () =>
  useQuery({
    queryKey: ["log-facets"],
    queryFn: () => get<ApiLogFacets>("/logs/facets"),
    staleTime: 60_000,
  });

const useRefreshData = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => !["settings", "rules"].includes(q.queryKey[0] as string) });
};

export const useLoadSynthetic = () => {
  const refresh = useRefreshData();
  return useMutation({
    mutationFn: async (seed: number = 42) => (await api.post<{ inserted: number }>("/demo/load", { seed, days: 7 })).data,
    onSuccess: (d, seed) => {
      refresh();
      toast.success(`Loaded ${d.inserted.toLocaleString()} synthetic requests (seed ${seed})`);
    },
    onError: () => toast.error("Couldn't load synthetic data. Please try again."),
  });
};

export const useClearData = () => {
  const refresh = useRefreshData();
  return useMutation({
    mutationFn: async () => {
      await api.delete("/data", { data: { confirm: "delete my data" } });
    },
    onSuccess: () => {
      refresh();
      toast.success("Cleared all logged requests");
    },
  });
};

export const useRerun = () => {
  const refresh = useRefreshData();
  return useMutation({ mutationFn: async () => (await api.post("/detection/run")).data, onSuccess: () => refresh() });
};

export const useSaveSettings = () => {
  const qc = useQueryClient();
  const refresh = useRefreshData();
  return useMutation({
    mutationFn: async (s: Settings) => fromApiSettings((await api.put<ApiSettings>("/settings", toApiSettingsUpdate(s) satisfies ApiSettingsUpdate)).data),
    onMutate: (s) => qc.setQueryData(["settings"], s),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      refresh();
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.error("Couldn't save settings. Check the values and try again.");
    },
  });
};
