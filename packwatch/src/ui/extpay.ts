// ExtensionPay client for extension pages (payment, trial and login pages open in a new tab).
import ExtPay from "extpay";
import { APP } from "../config/app";

let instance: ReturnType<typeof ExtPay> | null = null;
export function extpay() {
  instance ??= ExtPay(APP.EXTPAY_ID);
  return instance;
}
