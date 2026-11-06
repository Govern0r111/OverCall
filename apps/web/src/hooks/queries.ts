import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  api,
  ApiAccuracy,
  ApiIssueList,
  ApiLogList,
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
  toApiSettingsUpdate,
} from "../lib/api";

const get = async <T,>(url: string, params?: object) => (await api.get<T>(url, { params })).data;

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
export const useRules = () =>
  useQuery({ queryKey: ["rules"], queryFn: () => get<ApiRule[]>("/rules"), staleTime: Infinity });
export const useEvaluation = () =>
  useQuery({ queryKey: ["evaluate"], queryFn: () => get<ApiAccuracy>("/accuracy") });

export interface LogFilters {
  search?: string;
  provider?: string;
  status_class?: string;
  endpoint?: string;
}

export const useLogs = (filters: LogFilters) => {
  return useQuery({
    queryKey: ["logs", filters.provider ?? "all"],
    queryFn: async () => (await get<ApiLogList>("/logs", {
      limit: 200,
      ...(filters.provider ? { provider: filters.provider } : {}),
    })).items.map(fromApiLog),
    refetchInterval: 15_000,
  });
};

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
