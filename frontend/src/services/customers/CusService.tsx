import { AxiosInstance } from "axios";
import { Customer } from "@autumn/shared";

export class CusService {
  static async createCustomer(axios: AxiosInstance, data: any) {
    await axios.post("/v1/customers", data);
  }

  static async deleteCustomer(axios: AxiosInstance, customer_id: string) {
    await axios.delete(`/v1/customers/${customer_id}`);
  }

  static async addProduct(
    axios: AxiosInstance,
    customer_id: string,
    data: any
  ) {
    return await axios.post(`/v1/attach`, {
      customer_id,
      ...data,
    });
  }

  static async getProductOptions(axios: AxiosInstance, data: any) {
    return await axios.post(`/customers/product_options`, {
      ...data,
    });
  }

  static async updateCusEntitlement(
    axios: AxiosInstance,
    customer_entitlement_id: string,
    data: any
  ) {
    return await axios.post(
      `/v1/customers/customer_entitlements/${customer_entitlement_id}`,
      data
    );
  }

  static async updateCusProductStatus(
    axios: AxiosInstance,
    customer_product_id: string,
    data: any
  ) {
    return await axios.post(
      `/v1/customers/customer_products/${customer_product_id}`,
      data
    );
  }
}
