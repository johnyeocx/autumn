import axios from "axios";
import { endpoint } from "@/utils/constants";
import { useAuth } from "@clerk/clerk-react";
import { AppEnv } from "@autumn/shared";
import { useEnv } from "@/utils/envUtils";
const defaultParams = {
  isAuth: true,
};

export function useAxiosInstance(params?: { env?: AppEnv; isAuth?: boolean }) {
  const finalParams: any = {
    ...defaultParams,
    ...(params || {}),
  };

  const trueEnv = useEnv();

  const axiosInstance = axios.create({
    baseURL: endpoint,
  });

  const { getToken } = useAuth();

  if (finalParams.isAuth) {
    axiosInstance.interceptors.request.use(
      async (config: any) => {
        const token = await getToken({
          template: "custom_template",
        });

        if (token) {
          config.headers["Authorization"] = `Bearer ${token}`;
          config.headers["app_env"] = trueEnv;
        }

        return config;
      },
      (error: any) => {
        return Promise.reject(error);
      },
    );
  }

  return axiosInstance;
}
