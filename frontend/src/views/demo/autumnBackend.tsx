import axios, { AxiosInstance } from "axios";

export const createAxiosInstance = (secretKey: string, endpoint: string) => {
  return axios.create({
    baseURL: endpoint + "/v1",
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });
};
//Check access to Pro features and email balance
export const checkAccess = async ({
  axiosInstance,
  customerId,
  featureId,
  userId,
}: {
  axiosInstance: AxiosInstance;
  customerId: string;
  featureId: string;
  userId?: string;
}) => {
  const { data } = await axiosInstance.post("/entitled", {
    customer_id: customerId,
    feature_id: featureId,
    group: userId,
  });
  return data;
};

//Send usage event for
export const sendUsage = async ({
  axiosInstance,
  customerId,
  featureId,
  value,
  userId,
}: {
  axiosInstance: AxiosInstance;
  customerId: string;
  featureId: string;
  value: number;
  userId?: string;
}) => {
  const { data } = await axiosInstance.post("/events", {
    customer_id: customerId,
    event_name: featureId,
    properties: {
      value: value,
      user_id: userId,
    },
  });

  return data;
};
